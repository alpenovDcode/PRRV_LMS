import { NextRequest, NextResponse } from "next/server";
import { ApiResponse } from "@/types";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import { createPasswordResetToken, sendPasswordResetEmail } from "@/lib/password-reset";
import {
  logSuspiciousActivity,
  detectSuspiciousPatterns,
  getClientIp,
  getUserAgent,
} from "@/lib/security-logging";

const recoverSchema = z.object({
  email: z.string().email("Некорректный email"),
});

export async function POST(request: NextRequest) {
  try {
    const { allowed } = await rateLimit(request, {
      key: "auth:recover",
      limit: 5,
      windowInSeconds: 300, // 5 минут
    });

    if (!allowed) {
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: {
            code: "TOO_MANY_REQUESTS",
            message: "Слишком много попыток восстановления пароля. Попробуйте позже.",
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
      await logSuspiciousActivity(null, "PASSWORD_RECOVERY_ATTEMPT", {
        ip: getClientIp(request) || undefined,
        userAgent: getUserAgent(request) || undefined,
        path: request.nextUrl.pathname,
        reason: `Suspicious patterns detected: ${suspiciousPatterns.join(", ")}`,
        metadata: { patterns: suspiciousPatterns },
      });
    }

    const { email } = recoverSchema.parse(body);

    // Создаем токен восстановления (не раскрываем существование email)
    const token = await createPasswordResetToken(email);

    // Если пользователь существует, отправляем email
    if (token) {
      await sendPasswordResetEmail(email, token);
    }

    // Всегда возвращаем успех для безопасности (не раскрываем существование email)
    return NextResponse.json<ApiResponse>(
      {
        success: true,
        data: {
          message: "Если аккаунт с таким email существует, инструкции отправлены на почту",
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
            message: error.errors[0].message || "Некорректный email",
          },
        },
        { status: 400 }
      );
    }

    console.error("Recover password error:", error);
    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Произошла ошибка при восстановлении пароля",
        },
      },
      { status: 500 }
    );
  }
}


