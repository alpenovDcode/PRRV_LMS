import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";
import { getUserSessions, deactivateSession } from "@/lib/security-enhanced";
import { logAction } from "@/lib/audit";
import { db } from "@/lib/db";

/**
 * GET /api/admin/users/[id]/sessions
 * Получить все сессии пользователя
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    request,
    async () => {
        const { id } = await params;
      try {
        const sessions = await getUserSessions(id);

        return NextResponse.json<ApiResponse>(
          {
            success: true,
            data: sessions,
          },
          { status: 200 }
        );
      } catch (error) {
        console.error("Admin get user sessions error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Не удалось получить сессии пользователя",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin] }
  );
}

/**
 * DELETE /api/admin/users/[id]/sessions
 * Удалить сессии пользователя
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    request,
    async (req) => {
      try {
        const { id } = await params;
        const { searchParams } = new URL(request.url);
        const sessionId = searchParams.get("sessionId");
        const allSessions = searchParams.get("all") === "true";

        // Проверяем существование пользователя
        const user = await db.user.findUnique({
          where: { id },
          select: { id: true, email: true },
        });

        if (!user) {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: {
                code: "NOT_FOUND",
                message: "Пользователь не найден",
              },
            },
            { status: 404 }
          );
        }

        if (allSessions) {
          // Деактивируем все сессии
          await db.userSession.updateMany({
            where: { userId: id, isActive: true },
            data: { isActive: false },
          });

          // Инвалидируем sessionId в БД
          await db.user.update({
            where: { id },
            data: { sessionId: null },
          });

          await logAction(req.user!.userId, "DEACTIVATE_ALL_SESSIONS", "user", id, {
            targetUserId: id,
            targetEmail: user.email,
          });
        } else if (sessionId) {
          await deactivateSession(id, sessionId);

          await logAction(req.user!.userId, "DEACTIVATE_SESSION", "user", id, {
            targetUserId: id,
            sessionId,
          });
        } else {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: {
                code: "VALIDATION_ERROR",
                message: "Укажите sessionId или all=true",
              },
            },
            { status: 400 }
          );
        }

        return NextResponse.json<ApiResponse>(
          {
            success: true,
            data: {
              message: allSessions ? "Все сессии деактивированы" : "Сессия деактивирована",
            },
          },
          { status: 200 }
        );
      } catch (error) {
        console.error("Admin delete user sessions error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Не удалось удалить сессии",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin] }
  );
}

