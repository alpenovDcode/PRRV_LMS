import { NextRequest, NextResponse } from "next/server";
import { ApiResponse } from "@/types";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import {
  validatePasswordResetToken,
} from "@/lib/password-reset";
import { hashPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { invalidateAllSessions } from "@/lib/auth";
import {
  logSuspiciousActivity,
  detectSuspiciousPatterns,
  getClientIp,
  getUserAgent,
} from "@/lib/security-logging";

const resetPasswordSchema = z.object({
  token: z.string().min(1, "Токен обязателен"),
  password: z.string().min(6, "Пароль должен содержать минимум 6 символов"),
});

export async function POST(request: NextRequest) {
  try {
    const { allowed } = await rateLimit(request, {
      key: "auth:reset-password",
      limit: 5,
      windowInSeconds: 300, // 5 минут
    });

    if (!allowed) {
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: {
            code: "TOO_MANY_REQUESTS",
            message: "Слишком много попыток. Попробуйте позже.",
          },
        },
        { status: 429 }
      );
    }

    const body = await request.json();
    
    // Проверка на подозрительные паттерны
    const suspiciousPatterns = detectSuspiciousPatterns({
      ip: getClientIp(request),
      userAgent: getUserAgent(request),
      path: request.nextUrl.pathname,
      method: request.method,
      body: JSON.stringify(body),
    });

    if (suspiciousPatterns.length > 0) {
      await logSuspiciousActivity(null, "PASSWORD_RESET_ATTEMPT", {
        ip: getClientIp(request) || undefined,
        userAgent: getUserAgent(request) || undefined,
        path: request.nextUrl.pathname,
        reason: `Suspicious patterns detected: ${suspiciousPatterns.join(", ")}`,
        metadata: { patterns: suspiciousPatterns },
      });
    }

    const { token, password } = resetPasswordSchema.parse(body);

    // Проверяем валидность токена
    const tokenValidation = await validatePasswordResetToken(token);

    if (!tokenValidation.isValid || !tokenValidation.userId) {
      // Логируем попытку использования невалидного токена
      await logSuspiciousActivity(null, "INVALID_RESET_TOKEN", {
        ip: getClientIp(request) || undefined,
        userAgent: getUserAgent(request) || undefined,
        path: request.nextUrl.pathname,
        reason: "Invalid or expired password reset token",
      });

      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: {
            code: "INVALID_TOKEN",
            message: "Токен восстановления недействителен или истек",
          },
        },
        { status: 400 }
      );
    }

    // Хешируем новый пароль
    const passwordHash = await hashPassword(password);

    // Обновляем пароль и инвалидируем все сессии
    // tokenValidation.userId уже проверен выше, но TypeScript не знает об этом
    const userId = tokenValidation.userId!;
    
    await db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          passwordHash,
          passwordResetToken: null,
          passwordResetExpires: null,
        },
      });

      // Инвалидируем все сессии пользователя
      await invalidateAllSessions(userId);
    });

    return NextResponse.json<ApiResponse>(
      {
        success: true,
        data: {
          message: "Пароль успешно изменен",
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

    console.error("Reset password error:", error);
    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Произошла ошибка при сбросе пароля",
        },
      },
      { status: 500 }
    );
  }
}

