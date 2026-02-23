import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";
import { db } from "@/lib/db";
import { resetQuizAttempts } from "@/lib/quiz-logic";

/**
 * GET /api/admin/quiz/attempts/[id]
 * Получить детали попытки квиза
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
              include: {
                module: {
                  include: {
                    course: {
                      select: {
                        id: true,
                        title: true,
                        slug: true,
                      },
                    },
                  },
                },
              },
            },
            curator: {
              select: {
                id: true,
                email: true,
                fullName: true,
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

        return NextResponse.json<ApiResponse>(
          {
            success: true,
            data: attempt,
          },
          { status: 200 }
        );
      } catch (error) {
        console.error("Admin get quiz attempt error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Не удалось получить детали попытки",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}

/**
 * DELETE /api/admin/quiz/attempts/[id]
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
        const attempt = await db.quizAttempt.findUnique({
          where: { id },
          select: {
            userId: true,
            lessonId: true,
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

        await resetQuizAttempts(attempt.userId, attempt.lessonId, req.user!.userId);

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
        console.error("Admin reset quiz attempts error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Не удалось сбросить попытки",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}

