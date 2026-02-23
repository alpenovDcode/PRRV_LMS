import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";
import { db } from "@/lib/db";
import { logAction } from "@/lib/audit";

/**
 * GET /api/admin/users/[id]/2fa
 * Получить информацию о 2FA пользователя
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
        const twoFA = await db.twoFactorAuth.findUnique({
          where: { userId: id },
          select: {
            id: true,
            isEnabled: true,
            createdAt: true,
            updatedAt: true,
            // Не возвращаем secret и backupCodes для безопасности
          },
        });

        return NextResponse.json<ApiResponse>(
          {
            success: true,
            data: twoFA || { isEnabled: false },
          },
          { status: 200 }
        );
      } catch (error) {
        console.error("Admin get user 2FA error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Не удалось получить информацию о 2FA",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}

/**
 * DELETE /api/admin/users/[id]/2fa
 * Отключить 2FA пользователя (только админ)
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

        await db.twoFactorAuth.deleteMany({
          where: { userId: id },
        });

        // Audit log
        await logAction(req.user!.userId, "DISABLE_USER_2FA", "user", id, {
          targetUserId: id,
          targetEmail: user.email,
        });

        return NextResponse.json<ApiResponse>(
          {
            success: true,
            data: {
              message: "2FA отключена",
            },
          },
          { status: 200 }
        );
      } catch (error) {
        console.error("Admin disable user 2FA error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Не удалось отключить 2FA",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}

