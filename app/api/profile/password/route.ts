import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { z } from "zod";
import { logAction } from "@/lib/audit";

const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, "Текущий пароль обязателен"),
  newPassword: z.string().min(6, "Новый пароль должен содержать минимум 6 символов"),
});

export async function PUT(request: NextRequest) {
  return withAuth(request, async (req) => {
    try {
      const body = await request.json();
      const { currentPassword, newPassword } = passwordChangeSchema.parse(body);
      const userId = req.user!.userId;

      // Получаем пользователя с хешем пароля
      const user = await db.user.findUnique({
        where: { id: userId },
      });

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

      // Проверяем текущий пароль
      const isValid = await verifyPassword(currentPassword, user.passwordHash);

      if (!isValid) {
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INVALID_CREDENTIALS",
              message: "Текущий пароль неверен",
            },
          },
          { status: 400 }
        );
      }

      // Хешируем новый пароль
      const newPasswordHash = await hashPassword(newPassword);

      // Обновляем пароль
      await db.user.update({
        where: { id: userId },
        data: {
          passwordHash: newPasswordHash,
        },
      });

      // Логируем действие
      await logAction(userId, "CHANGE_PASSWORD", "user", userId, {
        ip: request.headers.get("x-forwarded-for") || "unknown",
      });

      return NextResponse.json<ApiResponse>(
        {
          success: true,
          data: { message: "Пароль успешно изменен" },
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

      console.error("Password change error:", error);
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Не удалось изменить пароль",
          },
        },
        { status: 500 }
      );
    }
  });
}
