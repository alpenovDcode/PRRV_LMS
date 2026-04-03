import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyAccessTokenEdge } from "./lib/auth-edge";

// Helper for constant-time comparison to prevent timing attacks
function isTokenEqual(a: string | undefined, b: string): boolean {
  if (!a) return false;
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  if (aBytes.length !== bBytes.length) return false;
  let result = 0;
  for (let i = 0; i < aBytes.length; i++) {
    result |= aBytes[i] ^ bBytes[i];
  }
  return result === 0;
}

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

  // Публичные роуты (точное совпадение или префикс)
  const isPublicRoute = 
    path === "/" ||
    path.startsWith("/login") ||
    path.startsWith("/register") ||
    path.startsWith("/recover-password") ||
    path.startsWith("/legal") ||
    path.startsWith("/maintenance") ||
    path.startsWith("/no-access") ||
    path.startsWith("/api/auth") ||
    path.startsWith("/api/health") ||
    path.startsWith("/l/") ||          // Landing pages
    path === "/l" ||                   // Landing root (if any)
    path.startsWith("/api/landings/submit") ||
    path.startsWith("/api/landings/check-status");

  // --- API SECURITY CHECK START ---
  if (
     path.startsWith("/api") && 
     path !== "/api/health" && 
     !path.startsWith("/api/auth") && 
     !path.startsWith("/api/video-proxy") &&
     !path.startsWith("/api/landings/submit") &&
     !path.startsWith("/api/landings/html") &&
     !path.startsWith("/api/video/token/public") &&
     !path.startsWith("/api/landings/check-status") &&
     !path.match(/^\/api\/landings\/[^/]+\/view$/)
  ) {
    // 1. Try to get token from Authorization header or cookie
    const authHeader = request.headers.get("authorization");
    let requestToken = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : undefined;
    if (!requestToken) {
      requestToken = request.cookies.get("accessToken")?.value;
    }

    const validKey = process.env.API_SECRET_KEY;
    
    // 2. Check if it's a valid API Key bypass
    if (validKey && isTokenEqual(requestToken, validKey)) {
      // System access granted
    } else {
      // 3. Check if it's a valid session
      let isAuthorized = false;

      if (requestToken) {
        try {
          const payload = await verifyAccessTokenEdge(requestToken);
          // Allow admins, curators, AND students to access API if they are logged in
          if (payload && (payload.role === "admin" || payload.role === "curator" || payload.role === "student")) {
            isAuthorized = true;
          }
        } catch (e) {
          // Token invalid, ignore
        }
      }

      if (!isAuthorized) {
        // Return 401 for API routes to trigger refresh or login
        return NextResponse.json(
          { success: false, error: { code: "UNAUTHORIZED", message: "Invalid API Key or Session" } },
          { status: 401 }
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
        // СТРОГАЯ ПРОВЕРКА: /admin - для админов и кураторов
        if (path.startsWith("/admin")) {
          // Исключаем /admin/restore из проверки (это страница восстановления)
          if (path !== "/admin/restore" && payload.role !== "admin" && payload.role !== "curator") {
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
          // Куратор на /dashboard -> редирект на /admin (или /curator/inbox)
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