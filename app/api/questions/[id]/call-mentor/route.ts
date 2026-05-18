import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { UserRole } from "@prisma/client";
import { ApiResponse } from "@/types";
import { sendTelegramMessage, escapeHtml } from "@/lib/telegram";

// Rate limit: one call per question per 30 minutes
const RATE_LIMIT_MS = 30 * 60 * 1000;

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return withAuth(
    request,
    async (req) => {
      const me = req.user!;
      const { id } = await context.params;

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

      if (question.studentId !== me.userId) {
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

      // Rate limit check
      if (question.lastMentorCallAt) {
        const elapsed = Date.now() - question.lastMentorCallAt.getTime();
        if (elapsed < RATE_LIMIT_MS) {
          const remainMin = Math.ceil((RATE_LIMIT_MS - elapsed) / 60000);
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: {
                code: "RATE_LIMITED",
                message: `Наставник уже вызван. Повторить можно через ${remainMin} мин.`,
              },
            },
            { status: 429 }
          );
        }
      }

      await db.question.update({
        where: { id },
        data: { lastMentorCallAt: new Date() },
      });

      const studentName = escapeHtml(question.student.fullName || question.student.email);
      const subject = escapeHtml(question.subject);
      const curatorLine = question.curator
        ? `\nНаставник: ${escapeHtml(question.curator.fullName || question.curator.email)}`
        : "\nНаставник: не назначен";
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
      const questionUrl = `${appUrl}/curator/questions/${id}`;
      const canAddButton = appUrl.startsWith("https://");

      const studentEmail = escapeHtml(question.student.email);
      const text =
        `🔔 <b>Вызов наставника!</b>\n` +
        `Ученик: <b>${studentName}</b> (${studentEmail})${curatorLine}\n` +
        `Вопрос: «${subject}»`;

      const chatId = process.env.MENTORS_TG_CHAT_ID;
      await sendTelegramMessage(text, {
        chatId,
        parseMode: "HTML",
        buttons: canAddButton ? [{ text: "Открыть вопрос", url: questionUrl }] : undefined,
      });

      return NextResponse.json<ApiResponse>({ success: true, data: { ok: true } });
    },
    { roles: [UserRole.student] }
  );
}
