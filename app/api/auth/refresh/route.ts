import { NextRequest, NextResponse } from "next/server";
import { verifyRefreshToken, generateAccessToken, validateSession } from "@/lib/auth";
import { ApiResponse } from "@/types";
import { z } from "zod";

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

// GET обработчик для middleware (редиректы)
export async function GET(request: NextRequest) {
  const redirectUrl = request.nextUrl.searchParams.get("redirect") || "/";
  const token = request.cookies.get("refreshToken")?.value;

  if (!token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", redirectUrl);
    return NextResponse.redirect(loginUrl);
  }

  const payload = verifyRefreshToken(token);

  if (!payload) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", redirectUrl);
    return NextResponse.redirect(loginUrl);
  }

  const isValidSession = await validateSession(payload.userId, payload.sessionId);

  if (!isValidSession) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", redirectUrl);
    return NextResponse.redirect(loginUrl);
  }

  const accessToken = generateAccessToken(payload);

  // Редиректим обратно на исходную страницу
  // Но сначала устанавливаем новый accessToken
  const response = NextResponse.redirect(new URL(redirectUrl, request.url));

  response.cookies.set("accessToken", accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 60 * 60 * 24 * 30, // 30 days default assumption, creates new session window
    path: "/",
  });

  return response;
}

export async function POST(request: NextRequest) {
  try {
    let token: string | undefined;

    // 1. Пытаемся взять из body
    try {
      const body = await request.json();
      const parsed = refreshSchema.safeParse(body);
      if (parsed.success) {
        token = parsed.data.refreshToken;
      }
    } catch {
      // тело может отсутствовать или быть пустым — это не критично
    }

    // 2. Если в body нет — берём из cookies
    if (!token) {
      token = request.cookies.get("refreshToken")?.value;
    }

    if (!token) {
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Refresh token обязателен",
          },
        },
        { status: 400 }
      );
    }

    const payload = verifyRefreshToken(token);

    if (!payload) {
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: {
            code: "INVALID_TOKEN",
            message: "Недействительный refresh token",
          },
        },
        { status: 401 }
      );
    }

    const isValidSession = await validateSession(payload.userId, payload.sessionId);

    if (!isValidSession) {
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: {
            code: "INVALID_SESSION",
            message: "Сессия истекла или недействительна",
          },
        },
        { status: 401 }
      );
    }

    const accessToken = generateAccessToken(payload);

    // НЕ возвращаем токен в body для безопасности
    const response = NextResponse.json<ApiResponse>(
      {
        success: true,
        data: {
          // Токен теперь только в httpOnly cookie
        },
      },
      { status: 200 }
    );

    // Устанавливаем accessToken в httpOnly cookie
    response.cookies.set("accessToken", accessToken, {
      httpOnly: true, // Теперь httpOnly для безопасности
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict", // Строгая защита от CSRF
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Refresh token error:", error);
    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Произошла ошибка при обновлении токена",
        },
      },
      { status: 500 }
    );
  }
}
