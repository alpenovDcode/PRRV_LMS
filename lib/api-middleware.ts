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
  handler: (req: AuthenticatedRequest) => Promise<NextResponse>,
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

    // 2. Если сессия не найдена или невалидна, проверяем API Key bypass
    const url = new URL(request.url);
    const apiKey = url.searchParams.get("apiKey");
    const serverSecret = process.env.API_SECRET_KEY;

    if (serverSecret && apiKey === serverSecret) {
      // Bypass session validation for valid API key
      const authenticatedRequest = request as AuthenticatedRequest;
      authenticatedRequest.user = {
        userId: "system-api",
        email: "system@api.local",
        role: "admin", // Grant admin role
        sessionId: "system-session",
      };
      
      // Allow request to proceed
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

