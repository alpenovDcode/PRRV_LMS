import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashPassword, generateAccessToken, generateRefreshToken, generateSessionId } from "@/lib/auth";
import { ApiResponse } from "@/types";
import { registerSchema } from "@/lib/validations";
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
    // CSRF защита
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
      key: "auth:register",
      limit: 5,
      windowInSeconds: 60,
    });

    if (!allowed) {
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: {
            code: "TOO_MANY_REQUESTS",
            message: "Слишком много попыток регистрации. Попробуйте позже.",
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
      await logSuspiciousActivity(null, "REGISTER_ATTEMPT", {
        ip: getClientIp(request) || undefined,
        userAgent: getUserAgent(request) || undefined,
        path: request.nextUrl.pathname,
        reason: `Suspicious patterns detected: ${suspiciousPatterns.join(", ")}`,
        metadata: { patterns: suspiciousPatterns },
      });
    }

    const { email, password, fullName } = registerSchema
      .extend({
        fullName: registerSchema.shape.fullName || z.string().optional(),
      })
      .parse(body);

    const existingUser = await db.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: {
            code: "USER_EXISTS",
            message: "Пользователь с таким email уже существует",
          },
        },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(password);
    const sessionId = generateSessionId();

    const user = await db.user.create({
      data: {
        email,
        passwordHash,
        fullName,
        sessionId,
      },
    });

    const payload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      sessionId,
    };

    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

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
      { status: 201 }
    );

    // Устанавливаем refreshToken в httpOnly cookie
    response.cookies.set("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict", // Строгая защита от CSRF
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
    });

    // Устанавливаем accessToken в httpOnly cookie
    response.cookies.set("accessToken", accessToken, {
      httpOnly: true, // Теперь httpOnly для безопасности
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict", // Строгая защита от CSRF
      maxAge: 60 * 30, // 30 minutes
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
            message: "Некорректные данные регистрации",
          },
        },
        { status: 400 }
      );
    }

    console.error("Register error:", error);
    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Произошла ошибка при регистрации",
        },
      },
      { status: 500 }
    );
  }
}


