import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";

export async function GET(request: NextRequest) {
  return withAuth(request, async (req) => {
    try {
      // Находим последний урок с прогрессом
      const lastProgress = await db.lessonProgress.findFirst({
        where: {
          userId: req.user!.userId,
          status: { in: ["in_progress", "completed"] },
        },
        include: {
          lesson: {
            include: {
              module: {
                include: {
                  course: {
                    select: {
                      id: true,
                      title: true,
                      slug: true,
                      description: true,
                      coverImage: true,
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: { lastUpdated: "desc" },
      });

      if (!lastProgress) {
        return NextResponse.json<ApiResponse>(
          {
            success: true,
            data: null,
          },
          { status: 200 }
        );
      }

      const course = lastProgress.lesson.module.course;
      const watchedTime = lastProgress.watchedTime;
      const videoDuration = lastProgress.lesson.videoDuration || 0;
      const watchedPercent = videoDuration > 0 ? Math.round((watchedTime / videoDuration) * 100) : 0;

      return NextResponse.json<ApiResponse>(
        {
          success: true,
          data: {
            course: {
              id: course.id,
              title: course.title,
              slug: course.slug,
              description: course.description,
              coverImage: course.coverImage,
            },
            lesson: {
              id: lastProgress.lesson.id,
              title: lastProgress.lesson.title,
              type: lastProgress.lesson.type,
            },
            watchedTime,
            videoDuration,
            watchedPercent,
            lastAccessed: lastProgress.lastUpdated,
          },
        },
        { status: 200 }
      );
    } catch (error) {
      console.error("Get continue lesson error:", error);
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Произошла ошибка при получении данных",
          },
        },
        { status: 500 }
      );
    }
  });
}

