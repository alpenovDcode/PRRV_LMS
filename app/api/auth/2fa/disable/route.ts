import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { ApiResponse } from "@/types";
import { db } from "@/lib/db";
import { verify2FA } from "@/lib/security-enhanced";
import { z } from "zod";

const disable2FASchema = z.object({
  code: z.string().min(1, "Код обязателен"),
});

/**
 * POST /api/auth/2fa/disable
 * Отключить 2FA (требует подтверждения кодом)
 */
export async function POST(request: NextRequest) {
  return withAuth(request, async (req) => {
    try {
      const body = await request.json();
      const { code } = disable2FASchema.parse(body);

      // Проверяем код
      const isValid = await verify2FA(req.user!.userId, code);

      if (!isValid) {
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INVALID_CODE",
              message: "Неверный код",
            },
          },
          { status: 400 }
        );
      }

      // Отключаем 2FA
      await db.twoFactorAuth.update({
        where: { userId: req.user!.userId },
        data: {
          isEnabled: false,
          secret: "", // Очищаем секрет
          backupCodes: [],
        },
      });

      return NextResponse.json<ApiResponse>(
        {
          success: true,
          data: {
            message: "2FA отключена",
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

      console.error("2FA disable error:", error);
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Произошла ошибка при отключении 2FA",
          },
        },
        { status: 500 }
      );
    }
  });
}

