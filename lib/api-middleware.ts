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
    // Сначала пытаемся получить токен из cookie (приоритет для httpOnly cookies)
    let token = request.cookies.get("accessToken")?.value;

    // Если нет в cookie, проверяем Authorization header (для обратной совместимости)
    if (!token) {
      const authHeader = request.headers.get("authorization");
      token = authHeader?.replace("Bearer ", "");
    }

    if (!token) {
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "Токен не предоставлен",
          },
        },
        { status: 401 }
      );
    }

    const payload = verifyAccessToken(token);

    if (!payload) {
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: {
            code: "INVALID_TOKEN",
            message: "Недействительный токен",
          },
        },
        { status: 401 }
      );
    }

    const isValidSession = await validateSession(payload.userId, payload.sessionId);

    if (!isValidSession) {
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: {
            code: "INVALID_SESSION",
            message: "Сессия истекла или недействительна",
          },
        },
        { status: 401 }
      );
    }

    // Проверка роли
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
  } catch (error) {
    console.error("Auth middleware error:", error);
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

