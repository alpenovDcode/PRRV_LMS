import { sendEmail, emailTemplates } from "@/lib/email-service";
import { NextResponse } from "next/server";
import { db as prisma } from "@/lib/db";
import { hash } from "bcrypt";
import { v4 as uuidv4 } from "uuid";
import { cookies } from "next/headers";
import { gradeHomework } from "@/lib/ai-grader";
import { notifyHomeworkSubmitted } from "@/lib/notifications";
import { syncLandingToBitrix } from "@/lib/landings/bitrix-sync";

export async function POST(req: Request) {
  try {
    const { blockId, data, answers } = await req.json();

    // ── Email / name key detection ──────────────────────────────────────────
    const emailKey = Object.keys(data).find((k) =>
      ["email", "почта", "e-mail", "эл. почта", "электронная почта"].includes(k.toLowerCase())
    );
    const nameKey = Object.keys(data).find(
      (k) => k.toLowerCase() === "имя" || k.toLowerCase() === "name"
    );

    const email = (emailKey ? data[emailKey] : data.email)?.toLowerCase().trim();
    const fullName: string | undefined = nameKey ? data[nameKey] : data.name;

    if (!email) {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }

    // ── 1. Fetch block info ─────────────────────────────────────────────────
    const block = await prisma.landingBlock.findUnique({ where: { id: blockId } });
    const blockContent = block?.content as any;
    const targetRole: string = blockContent?.role || "student";

    // ── 2. Find or create user (race-condition-safe) ─────────────────────────
    const validRoles = ["student", "teacher", "admin", "curator"];
    const roleToAssign = validRoles.includes(targetRole) ? targetRole : "student";

    let user: Awaited<ReturnType<typeof prisma.user.findUniqueOrThrow>>;
    let isNewUser = false;
    let generatedPassword = "";

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      user = existing;
    } else {
      generatedPassword = uuidv4().slice(0, 8);
      const passwordHash = await hash(generatedPassword, 10);
      try {
        user = await prisma.user.create({
          data: { email, fullName, passwordHash, role: roleToAssign as any, tariff: "SR" },
        });
        isNewUser = true;
      } catch (err: any) {
        if (err.code === "P2002") {
          // Race condition: another concurrent request created this user first
          user = await prisma.user.findUniqueOrThrow({ where: { email } });
        } else {
          throw err;
        }
      }
    }

    // ── 3. Schedule auto-review (legacy random delay) ────────────────────────
    const delayMinutes = Math.floor(Math.random() * (90 - 60 + 1) + 60);
    const autoResponseScheduledAt = new Date(Date.now() + delayMinutes * 60 * 1000);

    // ── 4. Pick random response template ────────────────────────────────────
    const templates: any[] = block?.responseTemplates || [];
    let responseTemplateIndex: number | null = null;
    const validIndices = templates
      .map((t, i) => (t && String(t).trim() !== "" ? i : -1))
      .filter((i) => i !== -1);
    if (validIndices.length > 0) {
      responseTemplateIndex = validIndices[Math.floor(Math.random() * validIndices.length)];
    }

    // ── 5. Create submission ─────────────────────────────────────────────────
    const submission = await prisma.homeworkSubmission.create({
      data: {
        userId: user.id,
        landingBlockId: blockId,
        content: JSON.stringify({ ...data, _answers: answers }),
        status: "pending",
        autoResponseScheduledAt,
        responseTemplateIndex,
      },
    });

    // ── 6. Set session cookie ────────────────────────────────────────────────
    const cookieStore = await cookies();
    cookieStore.set("landing_session_user", user.id, {
      httpOnly: true,
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    // ── 7. Background integration tasks ─────────────────────────────────────
    (async () => {
      const log = (msg: string) => console.log(msg);
      try {
        log(`Async task started for user ${user.id}`);

        await prisma.auditLog.create({
          data: {
            userId: user.id,
            action: "LANDING_SUBMISSION",
            entity: "HomeworkSubmission",
            entityId: submission.id,
            details: { step: "started", email, blockId },
          },
        });

        // Link TgSubscriber ↔ LMS User by email (fire-and-forget)
        import("@/lib/tg/user-linker")
          .then((m) => m.linkLmsUserToSubscribers(user.id, email))
          .catch(() => {});

        // ── Welcome email ───────────────────────────────────────────────────
        if (isNewUser) {
          try {
            await sendEmail({
              to: email,
              subject: "Добро пожаловать на ПРОРЫВ!",
              html: emailTemplates.welcome(email, generatedPassword),
            });
            await prisma.auditLog.create({
              data: {
                userId: user.id,
                action: "EMAIL_SENT",
                entity: "User",
                entityId: user.id,
                details: { type: "welcome", email },
              },
            });
          } catch (e: any) {
            log(`[ERROR] Failed to send welcome email: ${e.message}`);
          }
        }

        // ── LMS logic ───────────────────────────────────────────────────────
        log(`Fetching landing block ${blockId}`);
        const landingBlock = await prisma.landingBlock.findUnique({
          where: { id: blockId },
          include: { page: true },
        });

        // Keyword collection
        if (landingBlock?.content && typeof landingBlock.content === "object") {
          const bc = landingBlock.content as any;
          if (bc.isKeywordField && bc.hasInput && answers?.length > 0) {
            const keywordAnswer = answers[0]?.value;
            if (keywordAnswer && typeof keywordAnswer === "string" && keywordAnswer.trim()) {
              try {
                await prisma.user.update({
                  where: { id: user.id },
                  data: { keywords: { push: keywordAnswer.trim() } },
                });
                await prisma.auditLog.create({
                  data: {
                    userId: user.id,
                    action: "KEYWORD_SAVED",
                    entity: "User",
                    entityId: user.id,
                    details: { keyword: keywordAnswer.trim(), blockId },
                  },
                });
              } catch (e: any) {
                log(`[ERROR] Failed to save keyword: ${e.message}`);
              }
            }
          }
        }

        const lessonId = landingBlock?.lessonId;
        const submissionId = submission.id;

        if (lessonId) {
          const lesson = await prisma.lesson.findUnique({
            where: { id: lessonId },
            include: { module: true },
          });

          if (lesson) {
            const courseId = lesson.module.courseId;

            // Enroll if not yet enrolled
            const existingEnrollment = await prisma.enrollment.findUnique({
              where: { userId_courseId: { userId: user.id, courseId } },
            });
            if (!existingEnrollment) {
              await prisma.enrollment.create({
                data: { userId: user.id, courseId, status: "active", startDate: new Date() },
              });
              await prisma.auditLog.create({
                data: {
                  userId: user.id,
                  action: "COURSE_ENROLLMENT",
                  entity: "Course",
                  entityId: courseId,
                  details: { reason: "landing_submission" },
                },
              });
            }

            // Link submission → lesson
            await prisma.homeworkSubmission.update({
              where: { id: submissionId },
              data: { lessonId: lesson.id },
            });

            if (lesson.aiPrompt) {
              // AI auto-grading (legacy synchronous grader)
              const aiResult = await gradeHomework(
                JSON.stringify({ form: data, answers }),
                lesson.aiPrompt
              );
              await prisma.homeworkSubmission.update({
                where: { id: submissionId },
                data: {
                  status: aiResult.status,
                  curatorComment: aiResult.comment,
                  reviewedAt: new Date(),
                  curatorId: null,
                },
              });
              await prisma.auditLog.create({
                data: {
                  userId: user.id,
                  action: "AI_GRADING",
                  entity: "HomeworkSubmission",
                  entityId: submissionId,
                  details: { status: aiResult.status, comment_length: aiResult.comment?.length },
                },
              });
            } else {
              // No AI prompt → auto-approve
              await prisma.homeworkSubmission.update({
                where: { id: submissionId },
                data: {
                  status: "approved",
                  curatorComment: "Ответ получен! Спасибо за заполненную форму! Хорошего дня!",
                  reviewedAt: new Date(),
                  curatorId: null,
                },
              });
              try {
                await sendEmail({
                  to: email,
                  subject: `Ответ принят: ${lesson.title}`,
                  html: emailTemplates.homeworkAccepted(lesson.title),
                });
                await prisma.auditLog.create({
                  data: {
                    userId: user.id,
                    action: "EMAIL_SENT",
                    entity: "HomeworkSubmission",
                    entityId: submissionId,
                    details: { type: "accepted", email },
                  },
                });
              } catch (e: any) {
                log(`[ERROR] Failed to send accepted email: ${e.message}`);
              }
            }
          }
        } else {
          // No lesson attached — this is a pure lead-capture form.
          // Notify curators so МПЛ sees the new lead immediately.
          const pageTitle = (landingBlock?.page as any)?.title || "лендинга";
          notifyHomeworkSubmitted(
            pageTitle,
            user.fullName || email,
            submission.id
          ).catch(() => {});
        }

        // ── Bitrix24 sync ───────────────────────────────────────────────────
        const bitrixUrl = process.env.BITRIX24_WEBHOOK_URL;
        const pageSettings = (landingBlock?.page as any)?.settings;
        const isBitrixEnabled = pageSettings?.bitrix?.enabled ?? true;

        if (bitrixUrl && isBitrixEnabled) {
          const funnelId: string =
            pageSettings?.bitrix?.funnelId || process.env.BITRIX_FUNNEL_ID || "14";
          const stageId: string =
            pageSettings?.bitrix?.targetStageId ||
            process.env.BITRIX_SOURCE_STAGE_ID ||
            "C14:PREPAYMENT_INVOIC";

          const phoneKey = Object.keys(data).find(
            (k) => k.toLowerCase().includes("phone") || k.toLowerCase().includes("телефон")
          );
          const phone = phoneKey ? data[phoneKey] : null;

          const allBlocks = await prisma.landingBlock.findMany({
            where: { pageId: landingBlock?.pageId },
            orderBy: { orderIndex: "asc" },
          });

          const landingTitle =
            (landingBlock?.page as any)?.title || "Unknown Landing";

          const result = await syncLandingToBitrix({
            webhookUrl: bitrixUrl,
            funnelId,
            stageId,
            pageSettings,
            landingTitle,
            fullName: fullName || user.fullName || email,
            email,
            phone: phone ?? null,
            data,
            answers: answers ?? {},
            allBlocks,
            landingBlock,
          });

          if (result.ok) {
            await prisma.auditLog.create({
              data: {
                userId: user.id,
                action: result.action === "created" ? "BITRIX_DEAL" : "BITRIX_DEAL_UPDATE",
                entity: "Integration",
                entityId: String(result.dealId),
                details: {
                  contactId: result.contactId,
                  funnelId,
                  action: result.action,
                },
              },
            });
          } else {
            log(`[ERROR] Bitrix sync failed: ${result.error}`);
          }
        }
      } catch (err) {
        console.error("Async integration error:", err);
        try {
          await prisma.auditLog.create({
            data: {
              userId: user.id,
              action: "SUBMISSION_ERROR",
              entity: "HomeworkSubmission",
              entityId: submission.id,
              details: { error: String(err) },
            },
          });
        } catch {}
      }
    })();

    return NextResponse.json({ success: true, submissionId: submission.id });
  } catch (error) {
    console.error("Submit error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
