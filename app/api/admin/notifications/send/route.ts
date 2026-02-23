import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";
import { db } from "@/lib/db";
import { createNotification } from "@/lib/notifications";
import { logAction } from "@/lib/audit";
import { z } from "zod";

const sendNotificationSchema = z.object({
  userIds: z.array(z.string().uuid()).optional(), // Если не указано - отправка всем
  type: z.string().min(1),
  title: z.string().min(1),
  message: z.string().min(1),
  link: z.string().url().optional(),
});

/**
 * POST /api/admin/notifications/send
 * Отправить уведомления пользователям (массовая рассылка)
 */
export async function POST(request: NextRequest) {
  return withAuth(
    request,
    async (req) => {
      try {
        const body = await request.json();
        const { userIds, type, title, message, link } = sendNotificationSchema.parse(body);

        let targetUsers: Array<{ id: string }> = [];

        if (userIds && userIds.length > 0) {
          // Отправка конкретным пользователям
          targetUsers = await db.user.findMany({
            where: {
              id: { in: userIds },
            },
            select: { id: true },
          });
        } else {
          // Отправка всем пользователям
          targetUsers = await db.user.findMany({
            select: { id: true },
          });
        }

        // Отправляем уведомления
        const results = await Promise.allSettled(
          targetUsers.map((user) =>
            createNotification(user.id, type, title, message, link)
          )
        );

        const successCount = results.filter((r) => r.status === "fulfilled").length;
        const failedCount = results.filter((r) => r.status === "rejected").length;

        // Audit log
        await logAction(req.user!.userId, "SEND_NOTIFICATIONS", "notification", undefined, {
          type,
          title,
          targetCount: targetUsers.length,
          successCount,
          failedCount,
        });

        return NextResponse.json<ApiResponse>(
          {
            success: true,
            data: {
              message: `Уведомления отправлены ${successCount} пользователям`,
              successCount,
              failedCount,
              total: targetUsers.length,
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

        console.error("Admin send notifications error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Не удалось отправить уведомления",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}

