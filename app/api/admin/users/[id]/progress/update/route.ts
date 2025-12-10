import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { ApiResponse } from "@/types";
import { UserRole, ProgressStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { logAction } from "@/lib/audit";
import { z } from "zod";

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

        const updateData: any = {};
        if (status !== undefined) updateData.status = status;
        if (watchedTime !== undefined) updateData.watchedTime = watchedTime;
        if (completedAt !== undefined) {
          updateData.completedAt = completedAt ? new Date(completedAt) : null;
        }

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
            completedAt: completedAt ? new Date(completedAt) : null,
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
    { roles: [UserRole.admin] }
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

        if (!lessonId) {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: {
                code: "VALIDATION_ERROR",
                message: "lessonId обязателен",
              },
            },
            { status: 400 }
          );
        }

        await db.lessonProgress.deleteMany({
          where: {
            userId: id,
            lessonId,
          },
        });

        // Audit log
        await logAction(req.user!.userId, "RESET_USER_PROGRESS", "progress", undefined, {
          targetUserId: id,
          lessonId,
        });

        return NextResponse.json<ApiResponse>(
          {
            success: true,
            data: {
              message: "Прогресс сброшен",
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
    { roles: [UserRole.admin] }
  );
}

