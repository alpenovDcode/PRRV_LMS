import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { UserRole } from "@prisma/client";
import { ApiResponse } from "@/types";
import { createNotification } from "@/lib/notifications";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  return withAuth(
    request,
    async (req) => {
      try {
        const me = req.user!;
        const { rating, comment } = await request.json();
        const r = Number(rating);
        if (!Number.isInteger(r) || r < 1 || r > 10) {
          return NextResponse.json<ApiResponse>(
            { success: false, error: { code: "BAD_REQUEST", message: "Оценка должна быть целым числом от 1 до 10" } },
            { status: 400 }
          );
        }
        const question = await db.question.findUnique({ where: { id: params.id } });
        if (!question) {
          return NextResponse.json<ApiResponse>(
            { success: false, error: { code: "NOT_FOUND", message: "Вопрос не найден" } },
            { status: 404 }
          );
        }
        if (question.studentId !== me.userId) {
          return NextResponse.json<ApiResponse>(
            { success: false, error: { code: "FORBIDDEN", message: "Только автор может оценивать" } },
            { status: 403 }
          );
        }
        const updated = await db.question.update({
          where: { id: question.id },
          data: {
            rating: r,
            ratingComment: comment ? String(comment).trim().slice(0, 2000) : null,
            status: question.status === "closed" ? "closed" : "answered",
          },
        });
        if (question.curatorId) {
          await createNotification(
            question.curatorId,
            "question_rated",
            `Студент оценил ваш ответ: ${r}/10`,
            question.subject,
            `/curator/questions/${question.id}`
          );
        }
        return NextResponse.json<ApiResponse>({ success: true, data: { question: updated } });
      } catch (error) {
        console.error("Question rate error:", error);
        return NextResponse.json<ApiResponse>(
          { success: false, error: { code: "INTERNAL_ERROR", message: "Не удалось сохранить оценку" } },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.student] }
  );
}
