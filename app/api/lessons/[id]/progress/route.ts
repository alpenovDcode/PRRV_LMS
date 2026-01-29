import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { logAction } from "@/lib/audit";
import { z } from "zod";

const progressSchema = z.object({
  watchedTime: z.number().int().min(0),
  status: z.enum(["not_started", "in_progress", "completed"]).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (req) => {
    try {
      const { id } = await params;
        const body = await request.json();
      const { watchedTime, status, rating } = z.object({
        watchedTime: z.number().int().min(0),
        status: z.enum(["not_started", "in_progress", "completed"]).optional(),
        rating: z.number().int().min(1).max(10).optional(),
      }).parse(body);

      // Проверяем доступ к уроку
      const lesson = await db.lesson.findUnique({
        where: { id },
        include: {
          module: {
            include: {
              course: {
                include: {
                  enrollments: {
                    where: {
                      userId: req.user!.userId,
                      status: "active",
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!lesson || lesson.module.course.enrollments.length === 0) {
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "NO_ACCESS",
              message: "У вас нет доступа к этому уроку",
            },
          },
          { status: 403 }
        );
      }

      // Проверяем существующий прогресс, чтобы не дать изменить оценку
      const existingProgress = await db.lessonProgress.findUnique({
        where: {
          userId_lessonId: {
            userId: req.user!.userId,
            lessonId: id,
          },
        },
      });

      // Если оценка уже есть, мы не должны её менять
      // Если оценки нет, то можем записать новую (если она пришла)
      const ratingToSave = existingProgress?.rating ? undefined : rating;

      // Обновляем или создаем прогресс
      const progress = await db.lessonProgress.upsert({
        where: {
          userId_lessonId: {
            userId: req.user!.userId,
            lessonId: id,
          },
        },
        update: {
          watchedTime,
          status: status || "in_progress",
          // Если ratingToSave === undefined, Prisma просто не будет обновлять это поле
          rating: ratingToSave,
          completedAt: status === "completed" ? new Date() : undefined,
          lastUpdated: new Date(),
        },
        create: {
          userId: req.user!.userId,
          lessonId: id,
          watchedTime,
          status: status || "in_progress",
          rating: rating, // При создании можно ставить оценку
          completedAt: status === "completed" ? new Date() : undefined,
        },
      });

      // Если урок завершен, записываем в аудит
      if (status === "completed" && progress.status === "completed") {
        await logAction(req.user!.userId, "LESSON_COMPLETED", "lesson", id, {
          rating: ratingToSave
        });
      }

      return NextResponse.json<ApiResponse>(
        {
          success: true,
          data: {
            status: progress.status,
            watchedTime: progress.watchedTime,
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

      console.error("Update progress error:", error);
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Произошла ошибка при обновлении прогресса",
          },
        },
        { status: 500 }
      );
    }
  });
}

