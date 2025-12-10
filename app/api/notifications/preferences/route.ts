import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { ApiResponse } from "@/types";
import {
  getNotificationPreferences,
  updateNotificationPreferences,
} from "@/lib/notifications-enhanced";
import { z } from "zod";

const updatePreferencesSchema = z.object({
  channels: z
    .object({
      email: z.boolean().optional(),
      telegram: z.boolean().optional(),
      inApp: z.boolean().optional(),
    })
    .optional(),
  preferences: z
    .object({
      homeworkReviewed: z.boolean().optional(),
      newComment: z.boolean().optional(),
      lessonAvailable: z.boolean().optional(),
      deadlineReminder: z.boolean().optional(),
      quizResult: z.boolean().optional(),
    })
    .optional(),
});

/**
 * GET /api/notifications/preferences
 * Получить настройки уведомлений пользователя
 */
export async function GET(request: NextRequest) {
  return withAuth(request, async (req) => {
    try {
      const preferences = await getNotificationPreferences(req.user!.userId);

      return NextResponse.json<ApiResponse>(
        {
          success: true,
          data: preferences,
        },
        { status: 200 }
      );
    } catch (error) {
      console.error("Get notification preferences error:", error);
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Произошла ошибка при получении настроек",
          },
        },
        { status: 500 }
      );
    }
  });
}

/**
 * PATCH /api/notifications/preferences
 * Обновить настройки уведомлений
 */
export async function PATCH(request: NextRequest) {
  return withAuth(request, async (req) => {
    try {
      const body = await request.json();
      const { channels, preferences } = updatePreferencesSchema.parse(body);

      const updated = await updateNotificationPreferences(
        req.user!.userId,
        channels,
        preferences
      );

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

      console.error("Update notification preferences error:", error);
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Произошла ошибка при обновлении настроек",
          },
        },
        { status: 500 }
      );
    }
  });
}

