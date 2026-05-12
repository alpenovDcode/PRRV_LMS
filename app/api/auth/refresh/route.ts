import { NextRequest, NextResponse } from "next/server";
import {
  verifyRefreshToken,
  generateAccessToken,
  generateRefreshToken,
  validateSession,
} from "@/lib/auth";
import { ApiResponse } from "@/types";
import { z } from "zod";

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

const ACCESS_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 дней
const REFRESH_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 дней (продляем при каждом refresh)

// Helper to safely construct absolute URLs
function getSafeUrl(path: string, request: NextRequest): URL {
  const publicUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (publicUrl && !publicUrl.includes("localhost") && !publicUrl.includes("0.0.0.0")) {
    const url = new URL(path, publicUrl);
    return url;
  }
  return new URL(path, request.url);
}

function setAuthCookies(response: NextResponse, accessToken: string, refreshToken: string) {
  response.cookies.set("accessToken", accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: ACCESS_COOKIE_MAX_AGE,
    path: "/",
  });
  response.cookies.set("refreshToken", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: REFRESH_COOKIE_MAX_AGE,
    path: "/",
  });
}

// GET обработчик для legacy-вызовов: middleware больше его не использует
// (silent-refresh теперь в edge), но клиентский код или старые ссылки могут.
export async function GET(request: NextRequest) {
  const redirectUrl = request.nextUrl.searchParams.get("redirect") || "/";
  const token = request.cookies.get("refreshToken")?.value;

  if (!token) {
    const loginUrl = getSafeUrl("/login", request);
    loginUrl.searchParams.set("redirect", redirectUrl);
    return NextResponse.redirect(loginUrl);
  }

  const payload = verifyRefreshToken(token);
  if (!payload) {
    const loginUrl = getSafeUrl("/login", request);
    loginUrl.searchParams.set("redirect", redirectUrl);
    return NextResponse.redirect(loginUrl);
  }

  // Сначала пытаемся проверить сессию в БД. На 5xx (БД лежит) НЕ выкидываем —
  // подпись refresh-токена валидна, продолжаем и пишем новые cookies.
  let isValidSession = true;
  try {
    isValidSession = await validateSession(payload.userId, payload.sessionId);
  } catch (e) {
    console.error("Refresh GET validateSession failed, accepting token by signature:", e);
  }

  if (!isValidSession) {
    const loginUrl = getSafeUrl("/login", request);
    loginUrl.searchParams.set("redirect", redirectUrl);
    return NextResponse.redirect(loginUrl);
  }

  const accessToken = generateAccessToken(payload);
  const newRefreshToken = generateRefreshToken(payload);

  const response = NextResponse.redirect(getSafeUrl(redirectUrl, request));
  setAuthCookies(response, accessToken, newRefreshToken);
  return response;
}

export async function POST(request: NextRequest) {
  let token: string | undefined;

  // 1. Пытаемся взять из body
  try {
    const body = await request.json();
    const parsed = refreshSchema.safeParse(body);
    if (parsed.success) {
      token = parsed.data.refreshToken;
    }
  } catch {
    // тело может отсутствовать — это не критично
  }

  // 2. Если в body нет — берём из cookies
  if (!token) {
    token = request.cookies.get("refreshToken")?.value;
  }

  if (!token) {
    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error: { code: "VALIDATION_ERROR", message: "Refresh token обязателен" },
      },
      { status: 400 }
    );
  }

  const payload = verifyRefreshToken(token);
  if (!payload) {
    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error: { code: "INVALID_TOKEN", message: "Недействительный refresh token" },
      },
      { status: 401 }
    );
  }

  // validateSession бьёт в БД. На сетевом/БД-сбое возвращаем 503, чтобы
  // клиент сделал ретрай, а не разлогинил пользователя.
  let isValidSession: boolean;
  try {
    isValidSession = await validateSession(payload.userId, payload.sessionId);
  } catch (error) {
    console.error("Refresh validateSession transient error:", error);
    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error: { code: "SERVICE_UNAVAILABLE", message: "Временная ошибка, повторите позже" },
      },
      { status: 503 }
    );
  }

  if (!isValidSession) {
    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error: { code: "INVALID_SESSION", message: "Сессия истекла или недействительна" },
      },
      { status: 401 }
    );
  }

  const accessToken = generateAccessToken(payload);
  const newRefreshToken = generateRefreshToken(payload);

  const response = NextResponse.json<ApiResponse>(
    { success: true, data: {} },
    { status: 200 }
  );
  setAuthCookies(response, accessToken, newRefreshToken);
  return response;
}
