import { NextRequest, NextResponse } from "next/server";

/**
 * Проверка Origin header для защиты от CSRF атак
 * Используется для критичных операций (POST, PATCH, DELETE)
 */
export function validateOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  
  // В development разрешаем localhost
  if (process.env.NODE_ENV === "development") {
    if (origin?.includes("localhost") || origin?.includes("127.0.0.1")) {
      return true;
    }
    if (referer?.includes("localhost") || referer?.includes("127.0.0.1")) {
      return true;
    }
    // В dev без origin/referer тоже разрешаем
    if (!origin && !referer) return true;
  }

  // В production проверяем разрешенные домены
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",").map(s => s.trim()).filter(Boolean) || [];
  
  // БЕЗОПАСНОСТЬ: если origins не настроены в production — блокируем с предупреждением
  if (allowedOrigins.length === 0) {
    if (process.env.NODE_ENV === "production") {
      console.error(
        "[CSRF Security] ALLOWED_ORIGINS is not configured! " +
        "All cross-origin requests are being BLOCKED to prevent CSRF attacks. " +
        "Please set ALLOWED_ORIGINS in your .env file."
      );
      // В production без настройки — падаем «безопасно» (блокируем)
      // Исключение: запросы без Origin (серверные запросы, mobile apps с Auth header)
      if (!origin && !referer && request.headers.get("authorization")) {
        return true;
      }
      return false;
    }
    // В dev без настройки — разрешаем (для удобства разработки)
    return true;
  }

  if (origin) {
    return allowedOrigins.some((allowed) => origin.includes(allowed));
  }

  // Если Origin не установлен, но есть Referer - проверяем его
  if (referer) {
    try {
      const refererUrl = typeof URL !== 'undefined' ? new URL(referer) : null;
      if (refererUrl) {
        return allowedOrigins.some((allowed) => refererUrl.origin.includes(allowed));
      }
      return allowedOrigins.some((allowed) => referer.includes(allowed));
    } catch {
      return false;
    }
  }

  // Для API запросов из мобильных приложений (без Origin) — разрешаем
  // но только если есть валидный Authorization header
  if (!origin && !referer && request.headers.get("authorization")) {
    return true;
  }

  // По умолчанию блокируем
  return false;
}

/**
 * Middleware для проверки CSRF в API routes
 */
export function withCsrfProtection(
  request: NextRequest,
  handler: () => Promise<Response>
): Promise<Response> {
  // Проверяем только для модифицирующих методов
  const method = request.method;
  if (["POST", "PATCH", "PUT", "DELETE"].includes(method)) {
    if (!validateOrigin(request)) {
      return Promise.resolve(
        NextResponse.json(
          {
            success: false,
            error: {
              code: "CSRF_ERROR",
              message: "Запрос отклонен из соображений безопасности",
            },
          },
          { status: 403 }
        )
      );
    }
  }

  return handler();
}

