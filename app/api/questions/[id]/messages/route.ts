import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { UserRole } from "@prisma/client";
import { ApiResponse } from "@/types";
import { createNotification } from "@/lib/notifications";
import { sendEmail, emailTemplates } from "@/lib/email-service";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return withAuth(request, async (req) => {
    try {
      const me = req.user!;
      const { id } = await context.params;
      const { content, attachments } = await request.json();
      const cleanAttachments = Array.isArray(attachments)
        ? attachments
            .filter((a: any) => a && typeof a.url === "string")
            .map((a: any) => ({
              url: String(a.url),
              name: String(a.name || "file"),
              type: String(a.type || ""),
              size: typeof a.size === "number" ? a.size : null,
            }))
            .slice(0, 10)
        : [];
      const hasContent = content && String(content).trim();
      if (!hasContent && cleanAttachments.length === 0) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: { code: "BAD_REQUEST", message: "Сообщение или вложение обязательны" } },
          { status: 400 }
        );
      }

      const question = await db.question.findUnique({
        where: { id },
        include: {
          student: { select: { id: true, fullName: true, email: true } },
          curator: { select: { id: true, fullName: true, email: true } },
        },
      });
      if (!question) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: { code: "NOT_FOUND", message: "Вопрос не найден" } },
          { status: 404 }
        );
      }
      // Access check
      const isStudent = me.role === UserRole.student;
      const isCurator = me.role === UserRole.curator || me.role === UserRole.admin;
      if (isStudent && question.studentId !== me.userId) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: { code: "FORBIDDEN", message: "Нет доступа" } },
          { status: 403 }
        );
      }
      if (question.status === "closed") {
        return NextResponse.json<ApiResponse>(
          { success: false, error: { code: "CONFLICT", message: "Диалог закрыт" } },
          { status: 409 }
        );
      }

      const message = await db.questionMessage.create({
        data: {
          questionId: id,
          authorId: me.userId,
          content: hasContent ? String(content).trim() : "",
          attachments: cleanAttachments.length > 0 ? cleanAttachments : undefined,
        },
        include: { author: { select: { id: true, fullName: true, email: true, avatarUrl: true, role: true } } },
      });

      // Update question side-effects
      const updates: any = { updatedAt: new Date() };
      if (isCurator) {
        if (!question.curatorId) updates.curatorId = me.userId;
        if (!question.firstResponseAt) updates.firstResponseAt = new Date();
        if (question.status === "open") updates.status = "in_progress";
      }
      await db.question.update({ where: { id }, data: updates });

      // Notify the other side
      const subjectShort = question.subject.length > 60 ? question.subject.slice(0, 60) + "…" : question.subject;
      const preview = message.content.length > 200 ? message.content.slice(0, 200) + "…" : message.content;

      if (isCurator) {
        // Notify student
        await createNotification(
          question.studentId,
          "question_reply",
          `Ответ от наставника: ${subjectShort}`,
          preview,
          `/dashboard/questions/${id}`
        );
        if (question.student.email) {
          const fromName = (message.author.fullName as string) || "Наставник";
          sendEmail({
            to: question.student.email,
            subject: `Ответ наставника: ${subjectShort}`,
            html: emailTemplates.newQuestionMessage(question.subject, fromName, preview, id),
          }).catch((e) => console.error("Question reply email failed", e));
        }
      } else if (isStudent) {
        // Notify assigned curator (or all curators if not assigned yet)
        const targetCuratorId = question.curatorId || updates.curatorId;
        if (targetCuratorId) {
          await createNotification(
            targetCuratorId,
            "question_reply",
            `Сообщение в диалоге: ${subjectShort}`,
            preview,
            `/curator/questions/${id}`
          );
        } else {
          const curators = await db.user.findMany({
            where: { role: { in: [UserRole.curator, UserRole.admin] }, isBlocked: false },
            select: { id: true },
          });
          await Promise.allSettled(
            curators.map((c) =>
              createNotification(
                c.id,
                "question_reply",
                `Сообщение в открытом вопросе: ${subjectShort}`,
                preview,
                `/curator/questions/${id}`
              )
            )
          );
        }
      }

      return NextResponse.json<ApiResponse>({ success: true, data: { message } });
    } catch (error) {
      console.error("Question message error:", error);
      return NextResponse.json<ApiResponse>(
        { success: false, error: { code: "INTERNAL_ERROR", message: "Не удалось отправить сообщение" } },
        { status: 500 }
      );
    }
  });
}
