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
    "/api/health", // Allow health checks
  ];
  const isPublicRoute = publicRoutes.some((route) => path.startsWith(route));

  // --- API SECURITY CHECK START ---
  // Проверка ключа API для всех /api роутов
  // Исключаем webhook роуты (если будут) или public callback, но требование пользователя "строго ко всем"
  // Пропускаем /api/health для Docker Healthcheck и /api/auth для аутентификации браузера
  if (path.startsWith("/api") && path !== "/api/health" && !path.startsWith("/api/auth")) {
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
      const url = request.nextUrl.clone();
      url.pathname = "/api/auth/refresh";
      url.searchParams.set("redirect", path);
      // Removed appending apiKey to prevent exposure in URL
      return NextResponse.redirect(url);
    }

    const url = request.nextUrl.clone();
    url.pathname = "/login";
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
              const url = request.nextUrl.clone();
              url.pathname = "/admin/restore";
              return NextResponse.redirect(url);
            }
            const url = request.nextUrl.clone();
            url.pathname = "/no-access";
            return NextResponse.redirect(url);
          }
        }

        // СТРОГАЯ ПРОВЕРКА: /dashboard - только для админов и студентов
        if (path.startsWith("/dashboard") || path === "/dashboard") {
          // Куратор на /dashboard -> редирект на /curator/inbox (ПЕРЕД проверкой прав)
          if (payload.role === "curator") {
            const url = request.nextUrl.clone();
            url.pathname = "/curator/inbox";
            return NextResponse.redirect(url);
          }

          if (payload.role !== "admin" && payload.role !== "student") {
            const url = request.nextUrl.clone();
            url.pathname = "/no-access";
            return NextResponse.redirect(url);
          }
          // Администратор на /dashboard -> редирект на /admin
          // НО только если нет активной impersonation сессии
          const originalAdminToken = request.cookies.get("originalAdminToken")?.value;
          if (payload.role === "admin" && !originalAdminToken) {
            const url = request.nextUrl.clone();
            url.pathname = "/admin";
            return NextResponse.redirect(url);
          }
        }

        // СТРОГАЯ ПРОВЕРКА: /curator - только для админов и кураторов
        if (path.startsWith("/curator")) {
          if (payload.role !== "curator" && payload.role !== "admin") {
            const url = request.nextUrl.clone();
            url.pathname = "/no-access";
            return NextResponse.redirect(url);
          }
          // Куратор на /dashboard -> редирект на /curator/inbox
          if (payload.role === "curator" && path === "/dashboard") {
            const url = request.nextUrl.clone();
            url.pathname = "/curator/inbox";
            return NextResponse.redirect(url);
          }
        }

        // Редиректы для удобства навигации с главной страницы
        if (path === "/") {
          if (payload.role === "admin") {
            const url = request.nextUrl.clone();
            url.pathname = "/admin";
            return NextResponse.redirect(url);
          } else if (payload.role === "curator") {
            const url = request.nextUrl.clone();
            url.pathname = "/curator/inbox";
            return NextResponse.redirect(url);
          } else if (payload.role === "student") {
            const url = request.nextUrl.clone();
            url.pathname = "/dashboard";
            return NextResponse.redirect(url);
          }
        }
        

      } else {
        // Если токен невалидный, редирект на логин
        if (!isPublicRoute) {
          const refreshToken = request.cookies.get("refreshToken")?.value;
          if (refreshToken) {
            const url = request.nextUrl.clone();
            url.pathname = "/api/auth/refresh";
            url.searchParams.set("redirect", path);
            return NextResponse.redirect(url);
          }
          const url = request.nextUrl.clone();
          url.pathname = "/login";
          url.searchParams.set("redirect", path);
          return NextResponse.redirect(url);
        }
      }
    } catch {
      // Если токен невалидный, редирект на логин
      if (!isPublicRoute) {
        const refreshToken = request.cookies.get("refreshToken")?.value;
        if (refreshToken) {
          const url = request.nextUrl.clone();
          url.pathname = "/api/auth/refresh";
          url.searchParams.set("redirect", path);
          return NextResponse.redirect(url);
        }
        const url = request.nextUrl.clone();
        url.pathname = "/login";
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