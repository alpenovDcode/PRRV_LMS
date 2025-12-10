import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { ApiResponse } from "@/types";
import {
  generate2FASecret,
  generate2FAQRCode,
  generateBackupCodes,
  enable2FA,
} from "@/lib/security-enhanced";
import { db } from "@/lib/db";

/**
 * GET /api/auth/2fa/setup
 * Получить QR код для настройки 2FA
 */
export async function GET(request: NextRequest) {
  return withAuth(request, async (req) => {
    try {
      // Проверяем, не настроена ли уже 2FA
      const existing2FA = await db.twoFactorAuth.findUnique({
        where: { userId: req.user!.userId },
        select: { isEnabled: true },
      });

      if (existing2FA?.isEnabled) {
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "ALREADY_ENABLED",
              message: "2FA уже включена",
            },
          },
          { status: 400 }
        );
      }

      // Генерируем секрет и резервные коды
      const secret = generate2FASecret();
      const backupCodes = generateBackupCodes(10);
      const qrCodeUrl = generate2FAQRCode(req.user!.email, secret);

      // Сохраняем (но не активируем до подтверждения)
      await enable2FA(req.user!.userId, secret, backupCodes);

      return NextResponse.json<ApiResponse>(
        {
          success: true,
          data: {
            secret,
            qrCodeUrl,
            backupCodes, // Показываем только один раз при настройке
          },
        },
        { status: 200 }
      );
    } catch (error) {
      console.error("2FA setup error:", error);
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Произошла ошибка при настройке 2FA",
          },
        },
        { status: 500 }
      );
    }
  });
}

/**
 * POST /api/auth/2fa/setup
 * Подтвердить и активировать 2FA
 */
export async function POST(request: NextRequest) {
  return withAuth(request, async (req) => {
    try {
      const body = await request.json();
      const { token } = body;

      if (!token || typeof token !== "string") {
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Токен обязателен",
            },
          },
          { status: 400 }
        );
      }

      const { confirm2FA } = await import("@/lib/security-enhanced");
      const isValid = await confirm2FA(req.user!.userId, token);

      if (!isValid) {
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INVALID_TOKEN",
              message: "Неверный токен",
            },
          },
          { status: 400 }
        );
      }

      return NextResponse.json<ApiResponse>(
        {
          success: true,
          data: {
            message: "2FA успешно активирована",
          },
        },
        { status: 200 }
      );
    } catch (error) {
      console.error("2FA confirm error:", error);
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Произошла ошибка при активации 2FA",
          },
        },
        { status: 500 }
      );
    }
  });
}

