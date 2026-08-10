import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { ApiResponse } from "@/types";
import { UserRole, ProgressStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logAction } from "@/lib/audit";
import { z } from "zod";
import { buildProgressUpdateData } from "@/lib/progress-transfer";

const updateProgressSchema = z.object({
  lessonId: z.string().uuid(),
  status: z.enum(["not_started", "in_progress", "completed", "failed"]).optional(),
  watchedTime: z.number().int().min(0).optional(),
  completedAt: z.string().datetime().nullable().optional(),
});

/**
 * PATCH /api/admin/users/[id]/progress/update
 * Обновить прогресс пользователя по уроку (только админ)
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(
    request,
    async (req) => {
      try {
        const { id } = await params;
        const body = await request.json();
        const { lessonId, status, watchedTime, completedAt } = updateProgressSchema.parse(body);

        // Проверяем существование пользователя и урока
        const [user, lesson] = await Promise.all([
          db.user.findUnique({
            where: { id },
            select: { id: true, email: true },
          }),
          db.lesson.findUnique({
            where: { id: lessonId },
            select: { id: true, title: true },
          }),
        ]);

        if (!user) {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: {
                code: "NOT_FOUND",
                message: "Пользователь не найден",
              },
            },
            { status: 404 }
          );
        }

        if (!lesson) {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: {
                code: "NOT_FOUND",
                message: "Урок не найден",
              },
            },
            { status: 404 }
          );
        }

        const updateData: Prisma.LessonProgressUncheckedUpdateInput = buildProgressUpdateData(
          {
            status,
            watchedTime,
            completedAt:
              completedAt === undefined ? undefined : completedAt ? new Date(completedAt) : null,
          },
          new Date()
        );

        const progress = await db.lessonProgress.upsert({
          where: {
            userId_lessonId: {
              userId: id,
              lessonId,
            },
          },
          update: updateData,
          create: {
            userId: id,
            lessonId,
            status: (status as ProgressStatus) || "not_started",
            watchedTime: watchedTime || 0,
            completedAt:
              updateData.completedAt instanceof Date ? updateData.completedAt : null,
          },
        });

        // Audit log
        await logAction(req.user!.userId, "UPDATE_USER_PROGRESS", "progress", undefined, {
          targetUserId: id,
          lessonId,
          status,
          watchedTime,
        });

        return NextResponse.json<ApiResponse>(
          {
            success: true,
            data: progress,
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

        console.error("Admin update user progress error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Не удалось обновить прогресс",
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
 * DELETE /api/admin/users/[id]/progress/update
 * Сбросить прогресс пользователя по уроку
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
        const lessonId = searchParams.get("lessonId");

        if (!lessonId || !z.string().uuid().safeParse(lessonId).success) {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: {
                code: "VALIDATION_ERROR",
                message: "Укажите корректный lessonId",
              },
            },
            { status: 400 }
          );
        }

        const [user, lesson] = await Promise.all([
          db.user.findUnique({
            where: { id },
            select: { id: true },
          }),
          db.lesson.findUnique({
            where: { id: lessonId },
            select: { id: true, title: true, type: true },
          }),
        ]);

        if (!user || !lesson) {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: {
                code: "NOT_FOUND",
                message: !user ? "Пользователь не найден" : "Урок не найден",
              },
            },
            { status: 404 }
          );
        }

        const resetResult = await db.$transaction(async (tx) => {
          const deletedProgress = await tx.lessonProgress.deleteMany({
            where: {
              userId: id,
              lessonId,
            },
          });

          // Сертификация хранит ответы как HomeworkSubmission. Одного удаления
          // LessonProgress недостаточно: pending/approved submission блокирует
          // POST новой анкеты. Сохраняем старую попытку для аналитики, но
          // переводим её в rejected — следующая отправка создаст новую запись.
          let reopenedSubmissions = 0;
          if (lesson.type === "certification_form") {
            const reopened = await tx.homeworkSubmission.updateMany({
              where: {
                userId: id,
                lessonId,
                status: { in: ["pending", "approved"] },
              },
              data: {
                status: "rejected",
                reviewedAt: new Date(),
                curatorId: req.user!.userId,
              },
            });
            reopenedSubmissions = reopened.count;
          }

          return {
            deletedProgress: deletedProgress.count,
            reopenedSubmissions,
          };
        });

        // Audit log
        await logAction(req.user!.userId, "RESET_USER_PROGRESS", "progress", undefined, {
          targetUserId: id,
          lessonId,
          lessonTitle: lesson.title,
          lessonType: lesson.type,
          ...resetResult,
        });

        return NextResponse.json<ApiResponse>(
          {
            success: true,
            data: {
              message: "Прогресс сброшен",
              lessonType: lesson.type,
              ...resetResult,
            },
          },
          { status: 200 }
        );
      } catch (error) {
        console.error("Admin reset user progress error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Не удалось сбросить прогресс",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}
