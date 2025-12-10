import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";
import { db } from "@/lib/db";
import { logAction } from "@/lib/audit";
import { getHomeworkHistory } from "@/lib/homework-history";

// Отключаем статическую генерацию для этого роута
export const dynamic = 'force-dynamic';
export const dynamicParams = true;
export const runtime = 'nodejs';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

/**
 * GET /api/admin/homework/[id]
 * Получить детали домашнего задания с историей
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  return withAuth(
    request,
    async () => {
      try {
        const resolvedParams = await Promise.resolve(params);
        const submission = await db.homeworkSubmission.findUnique({
          where: { id: resolvedParams.id },
          include: {
            user: {
              select: {
                id: true,
                email: true,
                fullName: true,
              },
            },
            lesson: {
              include: {
                module: {
                  include: {
                    course: {
                      select: {
                        id: true,
                        title: true,
                        slug: true,
                      },
                    },
                  },
                },
              },
            },
            curator: {
              select: {
                id: true,
                email: true,
                fullName: true,
              },
            },
          },
        });

        if (!submission) {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: {
                code: "NOT_FOUND",
                message: "Домашнее задание не найдено",
              },
            },
            { status: 404 }
          );
        }

        // Получаем историю версий
        const history = await getHomeworkHistory(resolvedParams.id);

        return NextResponse.json<ApiResponse>(
          {
            success: true,
            data: {
              ...submission,
              history,
            },
          },
          { status: 200 }
        );
      } catch (error) {
        console.error("Admin get homework detail error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Не удалось получить детали домашнего задания",
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
 * DELETE /api/admin/homework/[id]
 * Удалить домашнее задание (только админ)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  return withAuth(
    request,
    async (req) => {
      try {
        const { id } = await params;
        const resolvedParams = await Promise.resolve(params);
        const submission = await db.homeworkSubmission.findUnique({
          where: { id: resolvedParams.id },
          select: {
            id: true,
            userId: true,
            lessonId: true,
          },
        });

        if (!submission) {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: {
                code: "NOT_FOUND",
                message: "Домашнее задание не найдено",
              },
            },
            { status: 404 }
          );
        }

        await db.homeworkSubmission.delete({
          where: { id: resolvedParams.id },
        });

        // Audit log
        await logAction(req.user!.userId, "DELETE_HOMEWORK", "homework", resolvedParams.id, {
          userId: submission.userId,
          lessonId: submission.lessonId,
        });

        return NextResponse.json<ApiResponse>(
          {
            success: true,
            data: {
              message: "Домашнее задание удалено",
            },
          },
          { status: 200 }
        );
      } catch (error) {
        console.error("Admin delete homework error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Не удалось удалить домашнее задание",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin] }
  );
}

