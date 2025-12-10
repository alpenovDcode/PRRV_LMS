import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { ApiResponse } from "@/types";
import { getHomeworkHistory } from "@/lib/homework-history";
import { db } from "@/lib/db";

/**
 * GET /api/homework/[id]/history
 * Получить историю версий домашнего задания
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (req) => {
    try {
      const { id } = await params;
        // Проверяем доступ к отправке
      const submission = await db.homeworkSubmission.findUnique({
        where: { id },
        select: {
          userId: true,
          lesson: {
            select: {
              module: {
                select: {
                  course: {
                    select: {
                      enrollments: {
                        where: { userId: req.user!.userId },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!submission) {
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Домашнее задание не найдено",
            },
          },
          { status: 404 }
        );
      }

      // Проверяем доступ: студент может видеть только свои, куратор/админ - все
      const isOwner = submission.userId === req.user!.userId;
      const isCuratorOrAdmin =
        req.user!.role === "curator" || req.user!.role === "admin";
      const hasEnrollment =
        submission.lesson.module.course.enrollments.length > 0;

      if (!isOwner && !isCuratorOrAdmin && !hasEnrollment) {
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "FORBIDDEN",
              message: "Нет доступа к истории этого задания",
            },
          },
          { status: 403 }
        );
      }

      const history = await getHomeworkHistory(id);

      return NextResponse.json<ApiResponse>(
        {
          success: true,
          data: history,
        },
        { status: 200 }
      );
    } catch (error) {
      console.error("Get homework history error:", error);
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Произошла ошибка при получении истории",
          },
        },
        { status: 500 }
      );
    }
  });
}

