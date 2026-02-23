import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";
import { db } from "@/lib/db";
import { logAction } from "@/lib/audit";

/**
 * DELETE /api/admin/comments/[id]
 * Удалить комментарий (физическое удаление для админа)
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
        const comment = await db.lessonComment.findUnique({
          where: { id },
          select: {
            id: true,
            lessonId: true,
            userId: true,
          },
        });

        if (!comment) {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: {
                code: "NOT_FOUND",
                message: "Комментарий не найден",
              },
            },
            { status: 404 }
          );
        }

        // Физическое удаление (админ может удалить полностью)
        await db.lessonComment.delete({
          where: { id },
        });

        // Audit log
        await logAction(req.user!.userId, "DELETE_COMMENT", "comment", id, {
          lessonId: comment.lessonId,
          deletedUserId: comment.userId,
        });

        return NextResponse.json<ApiResponse>(
          {
            success: true,
            data: {
              message: "Комментарий удален",
            },
          },
          { status: 200 }
        );
      } catch (error) {
        console.error("Admin delete comment error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Не удалось удалить комментарий",
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
 * PATCH /api/admin/comments/[id]
 * Восстановить удаленный комментарий или изменить статус
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    request,
    async (req) => {
      try {
        const { id } = await params;
        const body = await request.json();
        const { isDeleted } = body;

        const comment = await db.lessonComment.findUnique({
          where: { id },
        });

        if (!comment) {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: {
                code: "NOT_FOUND",
                message: "Комментарий не найден",
              },
            },
            { status: 404 }
          );
        }

        const updated = await db.lessonComment.update({
          where: { id },
          data: {
            isDeleted: isDeleted !== undefined ? isDeleted : comment.isDeleted,
          },
        });

        // Audit log
        await logAction(req.user!.userId, "UPDATE_COMMENT", "comment", id, {
          isDeleted: updated.isDeleted,
        });

        return NextResponse.json<ApiResponse>(
          {
            success: true,
            data: updated,
          },
          { status: 200 }
        );
      } catch (error) {
        console.error("Admin update comment error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Не удалось обновить комментарий",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}

