import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { ApiResponse } from "@/types";
import { UserRole, HomeworkStatus } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * GET /api/admin/homework
 * Получить все домашние задания (с фильтрами)
 */
export async function GET(request: NextRequest) {
  return withAuth(
    request,
    async () => {
      try {
        const searchParams = request.nextUrl.searchParams;
        const status = searchParams.get("status") as HomeworkStatus | null;
        const courseId = searchParams.get("courseId");
        const userId = searchParams.get("userId");
        const lessonId = searchParams.get("lessonId");
        const limit = parseInt(searchParams.get("limit") || "100");
        const offset = parseInt(searchParams.get("offset") || "0");

        const submissions = await db.homeworkSubmission.findMany({
          where: {
            status: status || undefined,
            userId: userId || undefined,
            lessonId: lessonId || undefined,
            lesson: courseId
              ? {
                  module: {
                    courseId,
                  },
                }
              : undefined,
          },
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
            _count: {
              select: {
                history: true,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
          take: limit,
          skip: offset,
        });

        const total = await db.homeworkSubmission.count({
          where: {
            status: status || undefined,
            userId: userId || undefined,
            lessonId: lessonId || undefined,
            lesson: courseId
              ? {
                  module: {
                    courseId,
                  },
                }
              : undefined,
          },
        });

        return NextResponse.json<ApiResponse>(
          {
            success: true,
            data: {
              submissions,
              total,
              limit,
              offset,
            },
          },
          { status: 200 }
        );
      } catch (error) {
        console.error("Admin get homework error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Не удалось получить список домашних заданий",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin] }
  );
}

