import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyAccessTokenEdge } from "./lib/auth-edge";

export async function middleware(request: NextRequest) {
  const token = request.cookies.get("accessToken")?.value;
  const path = request.nextUrl.pathname;

  // Публичные роуты
  const publicRoutes = [
    "/login",
    "/register",
    "/recover-password",
    "/legal",
    "/maintenance",
    "/no-access",
    "/api/auth",
  ];
  const isPublicRoute = publicRoutes.some((route) => path.startsWith(route));

  // --- API SECURITY CHECK START ---
  // Проверка ключа API для всех /api роутов
  // Исключаем webhook роуты (если будут) или public callback, но требование пользователя "строго ко всем"
  // Пропускаем /api/health для Docker Healthcheck
  if (path.startsWith("/api") && path !== "/api/health") {
    const apiKey = request.nextUrl.searchParams.get("apiKey");
    const validKey = process.env.API_SECRET_KEY;
    
    // Если ключ не задан в .env, пропускаем (режим разработки/отладки без ключа)
    // Но если задан - проверяем строго
    if (validKey && apiKey !== validKey) {
      // Для API возвращаем JSON
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Invalid API Key" } },
        { status: 403 }
      );
    }
  }
  // --- API SECURITY CHECK END ---

  // Если пользователь не авторизован и пытается зайти на защищенный роут
  if (!token && !isPublicRoute) {
    const refreshToken = request.cookies.get("refreshToken")?.value;
    
    // Если есть refreshToken, пробуем обновить сессию
    if (refreshToken) {
      const url = new URL("/api/auth/refresh", request.url);
      url.searchParams.set("redirect", path);
      // Append API Key for internal redirect to API
      if (process.env.API_SECRET_KEY) {
        url.searchParams.set("apiKey", process.env.API_SECRET_KEY);
      }
      return NextResponse.redirect(url);
    }

    const url = new URL("/login", request.url);
    url.searchParams.set("redirect", path);
    return NextResponse.redirect(url);
  }

  // Если есть токен, проверяем роль и строго контролируем доступ
  if (token) {
    try {
      const payload = await verifyAccessTokenEdge(token);
      if (payload) {
        // СТРОГАЯ ПРОВЕРКА: /admin - только для админов
        if (path.startsWith("/admin")) {
          // Исключаем /admin/restore из проверки (это страница восстановления)
          if (path !== "/admin/restore" && payload.role !== "admin") {
            // Проверяем, есть ли активная сессия impersonation
            const originalAdminToken = request.cookies.get("originalAdminToken")?.value;
            if (originalAdminToken) {
              // Если есть originalAdminToken, редиректим на страницу восстановления
              // которая автоматически восстановит аккаунт и перенаправит на /admin
              return NextResponse.redirect(new URL("/admin/restore", request.url));
            }
            return NextResponse.redirect(new URL("/no-access", request.url));
          }
        }

        // СТРОГАЯ ПРОВЕРКА: /dashboard - только для админов и студентов
        if (path.startsWith("/dashboard") || path === "/dashboard") {
          if (payload.role !== "admin" && payload.role !== "student") {
            return NextResponse.redirect(new URL("/no-access", request.url));
          }
          // Администратор на /dashboard -> редирект на /admin
          // НО только если нет активной impersonation сессии
          const originalAdminToken = request.cookies.get("originalAdminToken")?.value;
          if (payload.role === "admin" && !originalAdminToken) {
            return NextResponse.redirect(new URL("/admin", request.url));
          }
        }

        // СТРОГАЯ ПРОВЕРКА: /curator - только для админов и кураторов
        if (path.startsWith("/curator")) {
          if (payload.role !== "curator" && payload.role !== "admin") {
            return NextResponse.redirect(new URL("/no-access", request.url));
          }
          // Куратор на /dashboard -> редирект на /curator/inbox
          if (payload.role === "curator" && path === "/dashboard") {
            return NextResponse.redirect(new URL("/curator/inbox", request.url));
          }
        }

        // Редиректы для удобства навигации с главной страницы
        if (path === "/") {
          if (payload.role === "admin") {
            return NextResponse.redirect(new URL("/admin", request.url));
          } else if (payload.role === "curator") {
            return NextResponse.redirect(new URL("/curator/inbox", request.url));
          } else if (payload.role === "student") {
            return NextResponse.redirect(new URL("/dashboard", request.url));
          }
        }
        
        // Редирект куратора с /dashboard на его панель
        if (payload.role === "curator" && path === "/dashboard") {
          return NextResponse.redirect(new URL("/curator/inbox", request.url));
        }
      } else {
        // Если токен невалидный, редирект на логин
        if (!isPublicRoute) {
          const refreshToken = request.cookies.get("refreshToken")?.value;
          if (refreshToken) {
            const url = new URL("/api/auth/refresh", request.url);
            url.searchParams.set("redirect", path);
            if (process.env.API_SECRET_KEY) {
              url.searchParams.set("apiKey", process.env.API_SECRET_KEY);
            }
            return NextResponse.redirect(url);
          }
          const url = new URL("/login", request.url);
          url.searchParams.set("redirect", path);
          return NextResponse.redirect(url);
        }
      }
    } catch {
      // Если токен невалидный, редирект на логин
      if (!isPublicRoute) {
        const refreshToken = request.cookies.get("refreshToken")?.value;
        if (refreshToken) {
          const url = new URL("/api/auth/refresh", request.url);
          url.searchParams.set("redirect", path);
          if (process.env.API_SECRET_KEY) {
            url.searchParams.set("apiKey", process.env.API_SECRET_KEY);
          }
          return NextResponse.redirect(url);
        }
        const url = new URL("/login", request.url);
        url.searchParams.set("redirect", path);
        return NextResponse.redirect(url);
      }
    }
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", path);

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};

