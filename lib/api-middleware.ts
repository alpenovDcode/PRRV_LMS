import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken, validateSession } from "./auth";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";

export interface AuthenticatedRequest extends NextRequest {
  user?: {
    userId: string;
    email: string;
    role: UserRole;
    sessionId: string;
  };
}

export async function withAuth(
  request: NextRequest,
  handler: (req: AuthenticatedRequest) => Promise<Response>,
  options?: {
    roles?: UserRole[];
  }
) {
  try {
    // 1. Попытка аутентификации через сессию (cookie/header)
    let token = request.cookies.get("accessToken")?.value;
    if (!token) {
      const authHeader = request.headers.get("authorization");
      token = authHeader?.replace("Bearer ", "");
    }

    if (token) {
      const payload = verifyAccessToken(token);
      if (payload) {
        const isValidSession = await validateSession(payload.userId, payload.sessionId);
        if (isValidSession) {
          // Check roles if required
          if (options?.roles && !options.roles.includes(payload.role)) {
             return NextResponse.json<ApiResponse>(
              {
                success: false,
                error: {
                  code: "FORBIDDEN",
                  message: "Недостаточно прав доступа",
                },
              },
              { status: 403 }
            );
          }
           
          const authenticatedRequest = request as AuthenticatedRequest;
          authenticatedRequest.user = payload;
          return handler(authenticatedRequest);
        }
      }
    }

    // 2. Если сессия не найдена или невалидна, проверяем API Key bypass через Authorization header
    const serverSecret = process.env.API_SECRET_KEY;
    
    // Если в заголовке Authorization передан API Key напрямую (не JWT)
    if (serverSecret && token === serverSecret) {
      const authenticatedRequest = request as AuthenticatedRequest;
      authenticatedRequest.user = {
        userId: "system-api",
        email: "system@api.local",
        role: "admin", // Grant admin role for system-level calls
        sessionId: "system-session",
      };
      return handler(authenticatedRequest);
    }

    // 3. Если ни то, ни другое не сработало
    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Токен не предоставлен или недействителен",
        },
      },
      { status: 401 }
    );


  } catch (error) {
    console.error("[Middleware] Auth error:", error);
    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Произошла ошибка при проверке авторизации",
        },
      },
      { status: 500 }
    );
  }
}

