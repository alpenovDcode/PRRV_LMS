import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";
import { db } from "@/lib/db";
import { logAction } from "@/lib/audit";
import { z } from "zod";

const updateLessonSettingsSchema = z.object({
  commentsEnabled: z.boolean().optional(),
  homeworkDeadline: z.string().datetime().nullable().optional(),
  homeworkSoftDeadline: z.string().datetime().nullable().optional(),
  quizDeadline: z.string().datetime().nullable().optional(),
});

/**
 * PATCH /api/admin/lessons/[id]/settings
 * Обновить настройки урока (комментарии, дедлайны)
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
        const { commentsEnabled, homeworkDeadline, homeworkSoftDeadline, quizDeadline } =
          updateLessonSettingsSchema.parse(body);

        const lesson = await db.lesson.findUnique({
          where: { id },
          select: {
            id: true,
            title: true,
            settings: true,
          },
        });

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

        // Обновляем settings
        const currentSettings = (lesson.settings as any) || {};
        const updatedSettings = {
          ...currentSettings,
          ...(commentsEnabled !== undefined && { commentsEnabled }),
          ...(homeworkDeadline !== undefined && {
            homeworkDeadline: homeworkDeadline ? new Date(homeworkDeadline).toISOString() : null,
          }),
          ...(homeworkSoftDeadline !== undefined && {
            homeworkSoftDeadline: homeworkSoftDeadline
              ? new Date(homeworkSoftDeadline).toISOString()
              : null,
          }),
          ...(quizDeadline !== undefined && {
            quizDeadline: quizDeadline ? new Date(quizDeadline).toISOString() : null,
          }),
        };

        const updated = await db.lesson.update({
          where: { id },
          data: {
            settings: updatedSettings,
          },
        });

        // Audit log
        await logAction(req.user!.userId, "UPDATE_LESSON_SETTINGS", "lesson", id, {
          commentsEnabled,
          hasDeadlines: !!(homeworkDeadline || homeworkSoftDeadline || quizDeadline),
        });

        return NextResponse.json<ApiResponse>(
          {
            success: true,
            data: updated,
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

        console.error("Admin update lesson settings error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Не удалось обновить настройки урока",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin] }
  );
}

