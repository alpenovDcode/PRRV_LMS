import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { ApiResponse } from "@/types";
import { getUserSessions, deactivateSession, deactivateOtherSessions } from "@/lib/security-enhanced";

/**
 * GET /api/auth/sessions
 * Получить все активные сессии пользователя
 */
export async function GET(request: NextRequest) {
  return withAuth(request, async (req) => {
    try {
      const sessions = await getUserSessions(req.user!.userId);

      return NextResponse.json<ApiResponse>(
        {
          success: true,
          data: sessions.map((s) => ({
            id: s.id,
            sessionId: s.sessionId,
            deviceName: s.deviceName,
            deviceType: s.deviceType,
            ipAddress: s.ipAddress,
            lastActivityAt: s.lastActivityAt.toISOString(),
            createdAt: s.createdAt.toISOString(),
          })),
        },
        { status: 200 }
      );
    } catch (error) {
      console.error("Get sessions error:", error);
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Произошла ошибка при получении сессий",
          },
        },
        { status: 500 }
      );
    }
  });
}

/**
 * DELETE /api/auth/sessions
 * Удалить сессию или все другие сессии
 */
export async function DELETE(request: NextRequest) {
  return withAuth(request, async (req) => {
    try {
      const { searchParams } = new URL(request.url);
      const sessionId = searchParams.get("sessionId");
      const allOthers = searchParams.get("allOthers") === "true";

      if (allOthers) {
        // Деактивируем все другие сессии
        const currentSessionId = request.cookies.get("accessToken")?.value || "";
        await deactivateOtherSessions(req.user!.userId, currentSessionId);

        return NextResponse.json<ApiResponse>(
          {
            success: true,
            data: {
              message: "Все другие сессии деактивированы",
            },
          },
          { status: 200 }
        );
      }

      if (!sessionId) {
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "sessionId обязателен",
            },
          },
          { status: 400 }
        );
      }

      await deactivateSession(req.user!.userId, sessionId);

      return NextResponse.json<ApiResponse>(
        {
          success: true,
          data: {
            message: "Сессия деактивирована",
          },
        },
        { status: 200 }
      );
    } catch (error) {
      console.error("Delete session error:", error);
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Произошла ошибка при удалении сессии",
          },
        },
        { status: 500 }
      );
    }
  });
}

