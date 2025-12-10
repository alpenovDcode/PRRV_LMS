import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * GET /api/admin/comments
 * Получить все комментарии (с фильтрами для модерации)
 */
export async function GET(request: NextRequest) {
  return withAuth(
    request,
    async () => {
      try {
        const { searchParams } = new URL(request.url);
        const lessonId = searchParams.get("lessonId");
        const userId = searchParams.get("userId");
        const includeDeleted = searchParams.get("includeDeleted") === "true";
        const limit = parseInt(searchParams.get("limit") || "100");
        const offset = parseInt(searchParams.get("offset") || "0");

        const comments = await db.lessonComment.findMany({
          where: {
            lessonId: lessonId || undefined,
            userId: userId || undefined,
            isDeleted: includeDeleted ? undefined : false,
          },
          include: {
            user: {
              select: {
                id: true,
                email: true,
                fullName: true,
                avatarUrl: true,
              },
            },
            lesson: {
              select: {
                id: true,
                title: true,
                module: {
                  select: {
                    course: {
                      select: {
                        id: true,
                        title: true,
                      },
                    },
                  },
                },
              },
            },
            _count: {
              select: {
                replies: true,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
          take: limit,
          skip: offset,
        });

        const total = await db.lessonComment.count({
          where: {
            lessonId: lessonId || undefined,
            userId: userId || undefined,
            isDeleted: includeDeleted ? undefined : false,
          },
        });

        return NextResponse.json<ApiResponse>(
          {
            success: true,
            data: {
              comments,
              total,
              limit,
              offset,
            },
          },
          { status: 200 }
        );
      } catch (error) {
        console.error("Admin get comments error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Не удалось получить список комментариев",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin] }
  );
}

