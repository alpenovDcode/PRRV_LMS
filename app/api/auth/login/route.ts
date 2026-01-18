import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyPassword, generateAccessToken, generateRefreshToken, generateSessionId } from "@/lib/auth";
import { ApiResponse } from "@/types";
import { loginSchema } from "@/lib/validations";
import { rateLimit } from "@/lib/rate-limit";
import { validateOrigin } from "@/lib/csrf";
import {
  logSuspiciousActivity,
  detectSuspiciousPatterns,
  getClientIp,
  getUserAgent,
} from "@/lib/security-logging";
import { z } from "zod";

export async function POST(request: NextRequest) {
  try {
    // CSRF защита для критичных операций
    if (!validateOrigin(request)) {
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: {
            code: "CSRF_ERROR",
            message: "Запрос отклонен из соображений безопасности",
          },
        },
        { status: 403 }
      );
    }

    const { allowed } = await rateLimit(request, {
      key: "auth:login",
      limit: 10,
      windowInSeconds: 60,
    });

    if (!allowed) {
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: {
            code: "TOO_MANY_REQUESTS",
            message: "Слишком много попыток входа. Попробуйте позже.",
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
      await logSuspiciousActivity(null, "LOGIN_ATTEMPT", {
        ip: getClientIp(request) || undefined,
        userAgent: getUserAgent(request) || undefined,
        path: request.nextUrl.pathname,
        reason: `Suspicious patterns detected: ${suspiciousPatterns.join(", ")}`,
        metadata: { patterns: suspiciousPatterns },
      });
    }

    const { email, password, rememberMe } = loginSchema.parse(body);

    const user = await db.user.findUnique({
      where: { email },
    });

    // Защита от timing attacks: всегда выполняем проверку пароля
    // даже если пользователь не найден (используем dummy hash)
    const dummyHash = "$2a$12$dummy.hash.for.timing.attack.protection";
    const passwordHash = user?.passwordHash || dummyHash;
    
    // Всегда выполняем проверку пароля для защиты от timing attacks
    const isValidPassword = await verifyPassword(password, passwordHash);

    // Проверяем существование пользователя И корректность пароля
    if (!user || !isValidPassword) {
      // Логируем неудачную попытку входа
      const ip = getClientIp(request);
      const userAgent = getUserAgent(request);
      
      if (user) {
        // Логируем для существующего пользователя
        await logSuspiciousActivity(user.id, "LOGIN_FAILED", {
          ip: ip || undefined,
          userAgent: userAgent || undefined,
          path: request.nextUrl.pathname,
          reason: "invalid_password",
          metadata: { email },
        });
      } else {
        // Логируем попытку входа с несуществующим email
        await logSuspiciousActivity(null, "LOGIN_FAILED", {
          ip: ip || undefined,
          userAgent: userAgent || undefined,
          path: request.nextUrl.pathname,
          reason: "user_not_found",
          metadata: { email },
        });
      }

      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: {
            code: "INVALID_CREDENTIALS",
            message: "Неверный email или пароль",
          },
        },
        { status: 401 }
      );
    }

    const sessionId = generateSessionId();

    await db.user.update({
      where: { id: user.id },
      data: { sessionId },
    });

    const payload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      sessionId,
    };

    // Determine cookie expiration based on rememberMe
    const maxAge = rememberMe ? 60 * 60 * 24 * 90 : 60 * 60 * 24; // 90 days vs 24 hours

    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload, maxAge + "s");

    // НЕ возвращаем токены в body для безопасности
    const response = NextResponse.json<ApiResponse>(
      {
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            fullName: user.fullName,
            role: user.role,
          },
          // Токены теперь только в httpOnly cookies
        },
      },
      { status: 200 }
    );

    // Устанавливаем refreshToken в httpOnly cookie
    response.cookies.set("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict", // Строгая защита от CSRF
      maxAge: maxAge, 
      path: "/",
    });

    // Устанавливаем accessToken в httpOnly cookie (больше не доступен из JS)
    response.cookies.set("accessToken", accessToken, {
      httpOnly: true, // Теперь httpOnly для безопасности
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict", // Строгая защита от CSRF
      maxAge: maxAge, 
      path: "/",
    });

    return response;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Некорректные данные для входа",
          },
        },
        { status: 400 }
      );
    }

    console.error("Login error:", error);
    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Произошла ошибка при входе",
        },
      },
      { status: 500 }
    );
  }
}


