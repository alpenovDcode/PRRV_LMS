import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { z } from "zod";

const markReadSchema = z.object({
  notificationIds: z.array(z.string()).optional(),
  markAllAsRead: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  return withAuth(request, async (req) => {
    try {
      const { searchParams } = new URL(request.url);
      const unreadOnly = searchParams.get("unreadOnly") === "true";
      const limit = parseInt(searchParams.get("limit") || "20");
      const type = searchParams.get("type");

      const where: any = {
        userId: req.user!.userId,
      };

      if (unreadOnly) {
        where.isRead = false;
      }

      if (type) {
        where.type = type;
      }

      const notifications = await db.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: Math.min(limit, 100), // Максимум 100
      });

      const unreadCount = await db.notification.count({
        where: {
          userId: req.user!.userId,
          isRead: false,
        },
      });

      return NextResponse.json<ApiResponse>({
        success: true,
        data: {
          notifications,
          unreadCount,
        },
      });
    } catch (error) {
      console.error("Notifications error:", error);
      return NextResponse.json<ApiResponse>(
        { success: false, error: { code: "INTERNAL_ERROR", message: "Не удалось получить уведомления" } },
        { status: 500 }
      );
    }
  });
}

export async function PATCH(request: NextRequest) {
  return withAuth(request, async (req) => {
    try {
      const body = await request.json();
      const { notificationIds, markAllAsRead } = markReadSchema.parse(body);

      if (markAllAsRead) {
        // Отметить все как прочитанные
        await db.notification.updateMany({
          where: { userId: req.user!.userId, isRead: false },
          data: { isRead: true },
        });

        return NextResponse.json<ApiResponse>({
          success: true,
          data: { message: "Все уведомления отмечены как прочитанные" },
        });
      } else if (notificationIds && notificationIds.length > 0) {
        // Отметить конкретные уведомления
        await db.notification.updateMany({
          where: {
            id: { in: notificationIds },
            userId: req.user!.userId, // Безопасность: проверяем владельца
          },
          data: { isRead: true },
        });

        return NextResponse.json<ApiResponse>({
          success: true,
          data: { message: "Уведомления отмечены как прочитанные" },
        });
      } else {
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Укажите notificationIds или markAllAsRead: true",
            },
          },
          { status: 400 }
        );
      }
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

      console.error("Notifications update error:", error);
      return NextResponse.json<ApiResponse>(
        { success: false, error: { code: "INTERNAL_ERROR", message: "Не удалось обновить уведомления" } },
        { status: 500 }
      );
    }
  });
}

export async function DELETE(request: NextRequest) {
  return withAuth(request, async (req) => {
    try {
      const { searchParams } = new URL(request.url);
      const notificationId = searchParams.get("id");
      const deleteAll = searchParams.get("deleteAll") === "true";

      if (deleteAll) {
        // Удалить все прочитанные уведомления
        await db.notification.deleteMany({
          where: {
            userId: req.user!.userId,
            isRead: true,
          },
        });

        return NextResponse.json<ApiResponse>({
          success: true,
          data: { message: "Все прочитанные уведомления удалены" },
        });
      } else if (notificationId) {
        // Удалить конкретное уведомление
        await db.notification.deleteMany({
          where: {
            id: notificationId,
            userId: req.user!.userId, // Безопасность: проверяем владельца
          },
        });

        return NextResponse.json<ApiResponse>({
          success: true,
          data: { message: "Уведомление удалено" },
        });
      } else {
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Укажите id или deleteAll=true",
            },
          },
          { status: 400 }
        );
      }
    } catch (error) {
      console.error("Notifications delete error:", error);
      return NextResponse.json<ApiResponse>(
        { success: false, error: { code: "INTERNAL_ERROR", message: "Не удалось удалить уведомления" } },
        { status: 500 }
      );
    }
  });
}
