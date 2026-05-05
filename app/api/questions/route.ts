import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { UserRole } from "@prisma/client";
import { ApiResponse } from "@/types";
import { createNotification } from "@/lib/notifications";
import { sendTelegramMessage, escapeHtml } from "@/lib/telegram";

// GET /api/questions — list current user's questions (student)
export async function GET(request: NextRequest) {
  return withAuth(request, async (req) => {
    const userId = req.user!.userId;
    const items = await db.question.findMany({
      where: { studentId: userId },
      orderBy: { updatedAt: "desc" },
      include: {
        curator: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
        _count: { select: { messages: true } },
      },
    });
    return NextResponse.json<ApiResponse>({ success: true, data: { items } });
  });
}

// POST /api/questions — create new question (student)
export async function POST(request: NextRequest) {
  return withAuth(request, async (req) => {
    try {
      const body = await request.json();
      const { subject, content, lessonId, attachments } = body;
      if (!subject || (!content && !(Array.isArray(attachments) && attachments.length > 0))) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: { code: "BAD_REQUEST", message: "Тема и сообщение обязательны" } },
          { status: 400 }
        );
      }
      const userId = req.user!.userId;

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

      const question = await db.question.create({
        data: {
          studentId: userId,
          subject,
          lessonId: lessonId || null,
          status: "open",
          messages: {
            create: {
              authorId: userId,
              content: content || "",
              attachments: cleanAttachments.length > 0 ? cleanAttachments : undefined,
            },
          },
        },
        include: { messages: true },
      });

      // Notify all curators + admins about new question
      const curators = await db.user.findMany({
        where: { role: { in: [UserRole.curator, UserRole.admin] }, isBlocked: false },
        select: { id: true },
      });
      const student = await db.user.findUnique({ where: { id: userId }, select: { fullName: true, email: true } });
      const studentName = student?.fullName || student?.email || "Студент";
      await Promise.allSettled(
        curators.map((c) =>
          createNotification(
            c.id,
            "new_question",
            "Новый вопрос наставнику",
            `${studentName}: ${subject}`,
            `/curator/questions/${question.id}`
          )
        )
      );

      // Telegram notification (fire-and-forget)
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://prrv.tech";
      const link = `${appUrl}/curator/questions/${question.id}`;
      const preview = (content || "").slice(0, 300);
      const text =
        `🆕 <b>Новый вопрос наставнику</b>\n` +
        `👤 ${escapeHtml(studentName)}\n` +
        `📌 <b>${escapeHtml(subject)}</b>` +
        (preview ? `\n\n${escapeHtml(preview)}` : "") +
        (cleanAttachments.length > 0 ? `\n\n📎 Вложений: ${cleanAttachments.length}` : "");
      sendTelegramMessage(text, {
        buttons: [{ text: "Открыть вопрос", url: link }],
      }).catch((e) => console.error("Telegram notify failed", e));

      return NextResponse.json<ApiResponse>({ success: true, data: { question } });
    } catch (error) {
      console.error("Create question error:", error);
      return NextResponse.json<ApiResponse>(
        { success: false, error: { code: "INTERNAL_ERROR", message: "Не удалось создать вопрос" } },
        { status: 500 }
      );
    }
  });
}
