import { NextRequest, NextResponse } from "next/server";
import { ApiResponse } from "@/types";
import { db } from "@/lib/db";
import { generateAccessToken, generateRefreshToken } from "@/lib/auth";
import { verifyAccessTokenEdge } from "@/lib/auth-edge";
import { UserRole } from "@prisma/client";
import { logAction } from "@/lib/audit";

/**
 * POST /api/auth/impersonate/restore
 * Восстановить оригинальный аккаунт администратора после impersonation
 */
export async function POST(request: NextRequest) {
  try {
    // Получаем оригинальный токен администратора из специальной cookie
    const originalAdminToken = request.cookies.get("originalAdminToken")?.value;

    if (!originalAdminToken) {
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: {
            code: "NO_IMPERSONATION",
            message: "Нет активной сессии impersonation",
          },
        },
        { status: 400 }
      );
    }

    // Проверяем оригинальный токен администратора
    const adminPayload = await verifyAccessTokenEdge(originalAdminToken);

    if (!adminPayload || adminPayload.role !== UserRole.admin) {
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: {
            code: "INVALID_TOKEN",
            message: "Недействительный токен администратора",
          },
        },
        { status: 401 }
      );
    }

    // Получаем администратора из БД
    const admin = await db.user.findUnique({
      where: { id: adminPayload.userId },
      select: {
        id: true,
        email: true,
        role: true,
        sessionId: true,
      },
    });

    if (!admin || admin.role !== UserRole.admin) {
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Администратор не найден",
          },
        },
        { status: 404 }
      );
    }

    // Проверяем, что сессия администратора все еще валидна
    if (admin.sessionId !== adminPayload.sessionId) {
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: {
            code: "SESSION_EXPIRED",
            message: "Сессия администратора истекла",
          },
        },
        { status: 401 }
      );
    }

    // Генерируем новые токены для администратора
    const accessToken = generateAccessToken({
      userId: admin.id,
      email: admin.email,
      role: admin.role,
      sessionId: admin.sessionId,
    });

    const refreshToken = generateRefreshToken({
      userId: admin.id,
      email: admin.email,
      role: admin.role,
      sessionId: admin.sessionId,
    });

    // Audit log
    await logAction(admin.id, "RESTORE_FROM_IMPERSONATION", "auth", undefined, {
      restoredAt: new Date().toISOString(),
    });

    const response = NextResponse.json<ApiResponse>(
      {
        success: true,
        data: {
          message: "Аккаунт администратора восстановлен",
        },
      },
      { status: 200 }
    );

    // Устанавливаем токены администратора
    response.cookies.set("accessToken", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 60 * 30, // 30 минут
      path: "/",
    });

    response.cookies.set("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 60 * 60 * 24 * 7, // 7 дней
      path: "/",
    });

    // Удаляем cookie с оригинальным токеном
    response.cookies.set("originalAdminToken", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 0,
      path: "/",
    });

    // Если есть redirect параметр, редиректим туда
    const { searchParams } = new URL(request.url);
    const redirectTo = searchParams.get("redirect");

    if (redirectTo && redirectTo.startsWith("/admin")) {
      return NextResponse.redirect(new URL(redirectTo, request.url));
    }

    return response;
  } catch (error) {
    console.error("Restore from impersonation error:", error);
    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Произошла ошибка при восстановлении аккаунта",
        },
      },
      { status: 500 }
    );
  }
}

