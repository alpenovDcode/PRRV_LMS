import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  verifyAccessTokenEdge,
  verifyRefreshTokenEdge,
  signAccessTokenEdge,
  signRefreshTokenEdge,
} from "./lib/auth-edge";

const ACCESS_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 дней — fallback, cookie не должен умирать раньше refreshToken
const REFRESH_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 дней, продляется при каждом silent-refresh

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
    path.startsWith("/api/landings/html") ||
    path.startsWith("/api/video/token/public") ||
    path.startsWith("/api/video-proxy") ||
    path.startsWith("/api/landings/check-status");

  // 1. ПУБЛИЧНЫЕ РОУТЫ И ВИДЕО-ПРОКСИ (РАННИЙ ВЫХОД)
  if (isPublicRoute) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-pathname", path);
    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  }

  // --- API SECURITY CHECK START ---
  // Проверяем все API роуты, кроме базовых публичных (уже обработаны выше)
  if (path.startsWith("/api") && !path.startsWith("/api/auth") && path !== "/api/health") {
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

  // Пытаемся получить payload: сначала из accessToken, потом silent-refresh
  // через refreshToken прямо в edge (без 302 на /api/auth/refresh).
  let payload = token ? await verifyAccessTokenEdge(token).catch(() => null) : null;
  let refreshedAccessToken: string | null = null;
  let refreshedRefreshToken: string | null = null;

  if (!payload) {
    const refreshToken = request.cookies.get("refreshToken")?.value;
    if (refreshToken) {
      const refreshPayload = await verifyRefreshTokenEdge(refreshToken).catch(() => null);
      if (refreshPayload) {
        const minted = {
          userId: refreshPayload.userId,
          email: refreshPayload.email,
          role: refreshPayload.role,
          sessionId: refreshPayload.sessionId,
        };
        refreshedAccessToken = await signAccessTokenEdge(minted);
        // Ротация refresh: продляем окно жизни пока пользователь активен.
        refreshedRefreshToken = await signRefreshTokenEdge(minted);
        payload = minted;
      }
    }
  }

  // Хелпер, который проставляет свежие токены в Set-Cookie ответа.
  const attachRefreshedCookie = (response: NextResponse): NextResponse => {
    if (refreshedAccessToken) {
      response.cookies.set("accessToken", refreshedAccessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: ACCESS_COOKIE_MAX_AGE,
        path: "/",
      });
    }
    if (refreshedRefreshToken) {
      response.cookies.set("refreshToken", refreshedRefreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: REFRESH_COOKIE_MAX_AGE,
        path: "/",
      });
    }
    return response;
  };

  if (!payload) {
    const url = getSafeUrl("/login", request);
    url.searchParams.set("redirect", path);
    return NextResponse.redirect(url);
  }

  // СТРОГАЯ ПРОВЕРКА: /admin — для админов и кураторов
  if (path.startsWith("/admin")) {
    if (path !== "/admin/restore" && payload.role !== "admin" && payload.role !== "curator") {
      const originalAdminToken = request.cookies.get("originalAdminToken")?.value;
      if (originalAdminToken) {
        return attachRefreshedCookie(NextResponse.redirect(getSafeUrl("/admin/restore", request)));
      }
      return attachRefreshedCookie(NextResponse.redirect(getSafeUrl("/no-access", request)));
    }
  }

  // СТРОГАЯ ПРОВЕРКА: /dashboard — только для админов и студентов
  if (path.startsWith("/dashboard") || path === "/dashboard") {
    if (payload.role === "curator") {
      return attachRefreshedCookie(NextResponse.redirect(getSafeUrl("/curator/inbox", request)));
    }
    if (payload.role !== "admin" && payload.role !== "student") {
      return attachRefreshedCookie(NextResponse.redirect(getSafeUrl("/no-access", request)));
    }
  }

  // СТРОГАЯ ПРОВЕРКА: /curator — только для админов и кураторов
  if (path.startsWith("/curator")) {
    if (payload.role !== "curator" && payload.role !== "admin") {
      return attachRefreshedCookie(NextResponse.redirect(getSafeUrl("/no-access", request)));
    }
    const NATIVE_CURATOR = ["/curator/inbox", "/curator/questions", "/curator/review", "/curator/courses"];
    const isNative = NATIVE_CURATOR.some((p) => path === p || path.startsWith(p + "/"));
    if (!isNative && path !== "/curator") {
      const url = request.nextUrl.clone();
      url.pathname = path.replace(/^\/curator\//, "/admin/");
      return attachRefreshedCookie(NextResponse.rewrite(url));
    }
    if (path === "/curator") {
      const url = request.nextUrl.clone();
      url.pathname = "/admin";
      return attachRefreshedCookie(NextResponse.rewrite(url));
    }
  }

  // Редиректы для удобства навигации с главной страницы
  if (path === "/") {
    if (payload.role === "admin") {
      return attachRefreshedCookie(NextResponse.redirect(getSafeUrl("/admin", request)));
    } else if (payload.role === "curator") {
      return attachRefreshedCookie(NextResponse.redirect(getSafeUrl("/curator/inbox", request)));
    } else if (payload.role === "student") {
      return attachRefreshedCookie(NextResponse.redirect(getSafeUrl("/dashboard", request)));
    }
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", path);
  // Если только что обновили accessToken, прокидываем его в текущий запрос —
  // чтобы downstream-роуты в этом же RSC-цикле видели свежий токен.
  if (refreshedAccessToken) {
    const cookieHeader = request.headers.get("cookie") || "";
    const stripped = cookieHeader
      .split(/;\s*/)
      .filter((c) => c && !c.startsWith("accessToken="))
      .concat(`accessToken=${refreshedAccessToken}`)
      .join("; ");
    requestHeaders.set("cookie", stripped);
  }

  return attachRefreshedCookie(
    NextResponse.next({ request: { headers: requestHeaders } })
  );
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