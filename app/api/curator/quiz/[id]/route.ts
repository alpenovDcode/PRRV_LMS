import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";
import { reviewQuizAttempt, resetQuizAttempts } from "@/lib/quiz-logic";
import { db } from "@/lib/db";
import { z } from "zod";
import { logAction } from "@/lib/audit";

const reviewQuizSchema = z.object({
  score: z.number().int().min(0).max(100),
  comment: z.string().optional(),
});

/**
 * GET /api/curator/quiz/[id]
 * Получить информацию о попытке квиза для проверки
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    request,
    async () => {
        const { id } = await params;
      try {
        const attempt = await db.quizAttempt.findUnique({
          where: { id },
          include: {
            user: {
              select: {
                id: true,
                email: true,
                fullName: true,
              },
            },
            lesson: {
              select: {
                id: true,
                title: true,
                quizPassingScore: true,
              },
            },
          },
        });

        if (!attempt) {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: {
                code: "NOT_FOUND",
                message: "Попытка не найдена",
              },
            },
            { status: 404 }
          );
        }

        if (!attempt.requiresReview) {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: {
                code: "NO_REVIEW_NEEDED",
                message: "Эта попытка не требует ручной проверки",
              },
            },
            { status: 400 }
          );
        }

        return NextResponse.json<ApiResponse>(
          {
            success: true,
            data: attempt,
          },
          { status: 200 }
        );
      } catch (error) {
        console.error("Get quiz attempt error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Произошла ошибка при получении попытки",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.curator, UserRole.admin] }
  );
}

/**
 * PATCH /api/curator/quiz/[id]
 * Проверить квиз вручную
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    request,
    async (req) => {
      try {
        const { id } = await params;
        const body = await request.json();
        const { score, comment } = reviewQuizSchema.parse(body);

        await reviewQuizAttempt(id, req.user!.userId, score, comment);

        // Audit log
        await logAction(req.user!.userId, "REVIEW_QUIZ", "quiz", id, {
          score,
        });

        return NextResponse.json<ApiResponse>(
          {
            success: true,
            data: {
              message: "Квиз проверен",
            },
          },
          { status: 200 }
        );
      } catch (error) {
        if (error instanceof z.ZodError) {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: {
                code: "VALIDATION_ERROR",
                message: error.errors[0].message,
              },
            },
            { status: 400 }
          );
        }

        if (error instanceof Error) {
          if (error.message === "Attempt not found") {
            return NextResponse.json<ApiResponse>(
              {
                success: false,
                error: {
                  code: "NOT_FOUND",
                  message: "Попытка не найдена",
                },
              },
              { status: 404 }
            );
          }
          if (error.message === "Attempt does not require review") {
            return NextResponse.json<ApiResponse>(
              {
                success: false,
                error: {
                  code: "NO_REVIEW_NEEDED",
                  message: "Эта попытка не требует ручной проверки",
                },
              },
              { status: 400 }
            );
          }
        }

        console.error("Review quiz error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Произошла ошибка при проверке квиза",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.curator, UserRole.admin] }
  );
}

/**
 * DELETE /api/curator/quiz/[id]
 * Сбросить попытки квиза для пользователя
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    request,
    async (req) => {
      try {
        const { id } = await params;
        const { searchParams } = new URL(request.url);
        const userId = searchParams.get("userId");

        if (!userId) {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: {
                code: "VALIDATION_ERROR",
                message: "userId обязателен",
              },
            },
            { status: 400 }
          );
        }

        // Получаем lessonId из попытки
        const attempt = await db.quizAttempt.findUnique({
          where: { id },
          select: { lessonId: true },
        });

        if (!attempt) {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: {
                code: "NOT_FOUND",
                message: "Попытка не найдена",
              },
            },
            { status: 404 }
          );
        }

        await resetQuizAttempts(userId, attempt.lessonId, req.user!.userId);

        return NextResponse.json<ApiResponse>(
          {
            success: true,
            data: {
              message: "Попытки сброшены",
            },
          },
          { status: 200 }
        );
      } catch (error) {
        console.error("Reset quiz attempts error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Произошла ошибка при сбросе попыток",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.curator, UserRole.admin] }
  );
}

