import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * GET /api/admin/quiz/attempts
 * Получить все попытки квизов (с фильтрами)
 */
export async function GET(request: NextRequest) {
  return withAuth(
    request,
    async () => {
      try {
        const { searchParams } = new URL(request.url);
        const lessonId = searchParams.get("lessonId");
        const userId = searchParams.get("userId");
        const isPassed = searchParams.get("isPassed");
        const requiresReview = searchParams.get("requiresReview");
        const limit = parseInt(searchParams.get("limit") || "100");
        const offset = parseInt(searchParams.get("offset") || "0");

        const attempts = await db.quizAttempt.findMany({
          where: {
            lessonId: lessonId || undefined,
            userId: userId || undefined,
            isPassed: isPassed ? isPassed === "true" : undefined,
            requiresReview: requiresReview ? requiresReview === "true" : undefined,
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
              select: {
                id: true,
                title: true,
                quizPassingScore: true,
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
            curator: {
              select: {
                id: true,
                email: true,
                fullName: true,
              },
            },
          },
          orderBy: {
            submittedAt: "desc",
          },
          take: limit,
          skip: offset,
        });

        const total = await db.quizAttempt.count({
          where: {
            lessonId: lessonId || undefined,
            userId: userId || undefined,
            isPassed: isPassed ? isPassed === "true" : undefined,
            requiresReview: requiresReview ? requiresReview === "true" : undefined,
          },
        });

        return NextResponse.json<ApiResponse>(
          {
            success: true,
            data: {
              attempts,
              total,
              limit,
              offset,
            },
          },
          { status: 200 }
        );
      } catch (error) {
        console.error("Admin get quiz attempts error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Не удалось получить список попыток квизов",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin] }
  );
}

