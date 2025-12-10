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
  }

  // В production проверяем разрешенные домены
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",") || [];
  
  if (origin && allowedOrigins.length > 0) {
    return allowedOrigins.some((allowed) => origin.includes(allowed));
  }

  // Если Origin не установлен, но есть Referer - проверяем его
  if (referer && allowedOrigins.length > 0) {
    try {
      // Используем встроенный URL из Node.js вместо whatwg-url
      const refererUrl = typeof URL !== 'undefined' ? new URL(referer) : null;
      if (refererUrl) {
        return allowedOrigins.some((allowed) => refererUrl.origin.includes(allowed));
      }
      // Fallback: простая проверка строки
      return allowedOrigins.some((allowed) => referer.includes(allowed));
    } catch {
      return false;
    }
  }

  // Для API запросов из мобильных приложений (без Origin) - разрешаем
  // но только если есть валидный Authorization header
  if (!origin && !referer && request.headers.get("authorization")) {
    return true;
  }

  // По умолчанию блокируем, если нет явного разрешения
  return allowedOrigins.length === 0; // Если не настроено - разрешаем (для обратной совместимости)
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

