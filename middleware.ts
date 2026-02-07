import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyAccessTokenEdge } from "./lib/auth-edge";

// Helper to safely construct absolute URLs
function getSafeUrl(path: string, request: NextRequest): URL {
  const publicUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (publicUrl && !publicUrl.includes("localhost") && !publicUrl.includes("0.0.0.0")) {
    // If public URL is configured and looks valid, use it as base
    const url = new URL(path, publicUrl);
    // Copy search params if path doesn't contain them
    return url;
  }
  return new URL(path, request.url);
}

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
    "/l", // Public landing pages
  ];
  const isPublicRoute = publicRoutes.some((route) => path.startsWith(route));

  // --- API SECURITY CHECK START ---
  // Проверка ключа API для всех /api роутов
  // Исключаем webhook роуты (если будут) или public callback, но требование пользователя "строго ко всем"
  // Пропускаем /api/health для Docker Healthcheck и /api/auth для аутентификации браузера
  // и /api/video-proxy, так как видео-сегменты запрашиваются плеером без API ключа, но имеют свой JWT токен
  if (
     path.startsWith("/api") && 
     path !== "/api/health" && 
     !path.startsWith("/api/auth") && 
     !path.startsWith("/api/video-proxy") &&
     !path.startsWith("/api/landings/submit") &&
     !path.startsWith("/api/landings/check-status")
  ) {
    const apiKey = request.nextUrl.searchParams.get("apiKey");
    const validKey = process.env.API_SECRET_KEY;
    
    // Если ключ не задан в .env, пропускаем (режим разработки/отладки без ключа)
    // Но если задан - проверяем строго
    if (validKey && apiKey !== validKey) {
      // PROPYV_UPDATE: Allow authenticated sessions (Cookie) to bypass API Key check
      // This fixes issues where client-side env vars might be missing
      const token = request.cookies.get("accessToken")?.value;
      let isAuthorized = false;

      if (token) {
        try {
          const payload = await verifyAccessTokenEdge(token);
          // Allow admins and curators to access API without key (since they are logged in)
          if (payload && (payload.role === "admin" || payload.role === "curator")) {
            isAuthorized = true;
          }
        } catch (e) {
          // Token invalid, ignore
        }
      }

      if (!isAuthorized) {
        // Для API возвращаем JSON
        return NextResponse.json(
          { success: false, error: { code: "FORBIDDEN", message: "Invalid API Key or Session" } },
          { status: 403 }
        );
      }
    }
  }
  // --- API SECURITY CHECK END ---

  // Если пользователь не авторизован и пытается зайти на защищенный роут
  if (!token && !isPublicRoute) {
    const refreshToken = request.cookies.get("refreshToken")?.value;
    
    // Если есть refreshToken, пробуем обновить сессию
    if (refreshToken) {
      const url = getSafeUrl("/api/auth/refresh", request);
      url.searchParams.set("redirect", path);
      // Removed appending apiKey to prevent exposure in URL
      return NextResponse.redirect(url);
    }

    const url = getSafeUrl("/login", request);
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
              const url = getSafeUrl("/admin/restore", request);
              return NextResponse.redirect(url);
            }
            const url = getSafeUrl("/no-access", request);
            return NextResponse.redirect(url);
          }
        }

        // СТРОГАЯ ПРОВЕРКА: /dashboard - только для админов и студентов
        if (path.startsWith("/dashboard") || path === "/dashboard") {
          // Куратор на /dashboard -> редирект на /curator/inbox (ПЕРЕД проверкой прав)
          if (payload.role === "curator") {
            const url = getSafeUrl("/curator/inbox", request);
            return NextResponse.redirect(url);
          }

          if (payload.role !== "admin" && payload.role !== "student") {
            const url = getSafeUrl("/no-access", request);
            return NextResponse.redirect(url);
          }
           // Allow admins to access /dashboard
        }

        // СТРОГАЯ ПРОВЕРКА: /curator - только для админов и кураторов
        if (path.startsWith("/curator")) {
          if (payload.role !== "curator" && payload.role !== "admin") {
            const url = getSafeUrl("/no-access", request);
            return NextResponse.redirect(url);
          }
          // Куратор на /dashboard -> редирект на /curator/inbox
          if (payload.role === "curator" && path === "/dashboard") {
            const url = getSafeUrl("/curator/inbox", request);
            return NextResponse.redirect(url);
          }
        }

        // Редиректы для удобства навигации с главной страницы
        if (path === "/") {
          if (payload.role === "admin") {
            const url = getSafeUrl("/admin", request);
            return NextResponse.redirect(url);
          } else if (payload.role === "curator") {
            const url = getSafeUrl("/curator/inbox", request);
            return NextResponse.redirect(url);
          } else if (payload.role === "student") {
            const url = getSafeUrl("/dashboard", request);
            return NextResponse.redirect(url);
          }
        }
        

      } else {
        // Если токен невалидный, редирект на логин
        if (!isPublicRoute) {
          const refreshToken = request.cookies.get("refreshToken")?.value;
          if (refreshToken) {
            const url = getSafeUrl("/api/auth/refresh", request);
            url.searchParams.set("redirect", path);
            return NextResponse.redirect(url);
          }
          const url = getSafeUrl("/login", request);
          url.searchParams.set("redirect", path);
          return NextResponse.redirect(url);
        }
      }
    } catch {
      // Если токен невалидный, редирект на логин
      if (!isPublicRoute) {
        const refreshToken = request.cookies.get("refreshToken")?.value;
        if (refreshToken) {
          const url = getSafeUrl("/api/auth/refresh", request);
          url.searchParams.set("redirect", path);
          return NextResponse.redirect(url);
        }
        const url = getSafeUrl("/login", request);
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