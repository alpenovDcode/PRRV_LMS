import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { generateAccessToken, generateRefreshToken, generateSessionId } from "@/lib/auth";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";
import { logAction } from "@/lib/audit";
import {
  logSuspiciousActivity,
  getClientIp,
  getUserAgent,
} from "@/lib/security-logging";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    request,
    async (req) => {
      try {
        const { id } = await params;
        // Проверяем, что запрашивающий - администратор
        if (req.user!.role !== UserRole.admin) {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: {
                code: "FORBIDDEN",
                message: "Только администраторы могут использовать режим Login as User",
              },
            },
            { status: 403 }
          );
        }

        // Получаем пользователя, от имени которого нужно войти
        const targetUser = await db.user.findUnique({
          where: { id },
        });

        if (!targetUser) {
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

        // Создаем новую сессию для целевого пользователя
        const sessionId = generateSessionId();
        await db.user.update({
          where: { id: targetUser.id },
          data: { sessionId },
        });

        // Генерируем токены для целевого пользователя
        const accessToken = generateAccessToken({
          userId: targetUser.id,
          email: targetUser.email,
          role: targetUser.role,
          sessionId,
        });

        const refreshToken = generateRefreshToken({
          userId: targetUser.id,
          email: targetUser.email,
          role: targetUser.role,
          sessionId,
        });

        // Audit log - критичное действие
        await logAction(req.user!.userId, "IMPERSONATE_USER", "user", targetUser.id, {
          targetEmail: targetUser.email,
          targetRole: targetUser.role,
        });

        // Логирование подозрительной активности для impersonation
        await logSuspiciousActivity(req.user!.userId, "IMPERSONATION", {
          ip: getClientIp(request) || undefined,
          userAgent: getUserAgent(request) || undefined,
          path: request.nextUrl.pathname,
          reason: "Admin impersonation",
          metadata: {
            adminId: req.user!.userId,
            targetUserId: targetUser.id,
            targetEmail: targetUser.email,
          },
        });

        // Сохраняем оригинальный токен администратора для возможности возврата
        const originalAdminToken = request.cookies.get("accessToken")?.value;
        
        console.log("[IMPERSONATE] Admin impersonating user:", {
          adminId: req.user!.userId,
          targetUserId: targetUser.id,
          targetEmail: targetUser.email,
          hasOriginalToken: !!originalAdminToken,
        });

        // НЕ возвращаем токены в body для безопасности
        const response = NextResponse.json<ApiResponse>(
          {
            success: true,
            data: {
              user: {
                id: targetUser.id,
                email: targetUser.email,
                fullName: targetUser.fullName,
                role: targetUser.role,
              },
              // Токены теперь только в httpOnly cookies
            },
          },
          { status: 200 }
        );

        // Сохраняем оригинальный токен администратора в специальной cookie
        if (originalAdminToken) {
          console.log("[IMPERSONATE] Setting originalAdminToken cookie, length:", originalAdminToken.length);
          response.cookies.set("originalAdminToken", originalAdminToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax", // Изменено с strict на lax для лучшей совместимости
            maxAge: 60 * 60 * 24, // 24 часа (достаточно для сессии impersonation)
            path: "/",
          });
          console.log("[IMPERSONATE] Cookie set successfully");
        } else {
          console.log("[IMPERSONATE] WARNING: No originalAdminToken found!");
        }

        // Устанавливаем токены целевого пользователя
        response.cookies.set("accessToken", accessToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax", // Изменено для лучшей совместимости
          maxAge: 30 * 60, // 30 минут
          path: "/",
        });

        response.cookies.set("refreshToken", refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax", // Изменено для лучшей совместимости
          maxAge: 7 * 24 * 60 * 60, // 7 дней
          path: "/",
        });
        
        console.log("[IMPERSONATE] All cookies set - ready to impersonate");

        return response;
      } catch (error) {
        console.error("Impersonate user error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Произошла ошибка при входе от имени пользователя",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin] }
  );
}

