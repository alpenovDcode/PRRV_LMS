import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";

export async function GET(request: NextRequest) {
  return withAuth(request, async (req) => {
    try {
      const enrollments = await db.enrollment.findMany({
        where: {
          userId: req.user!.userId,
          status: "active",
        },
        include: {
          course: {
            include: {
              modules: {
                include: {
                  lessons: true,
                },
              },
            },
          },
        },
      });

      const coursesWithProgress = await Promise.all(
        enrollments.map(async (enrollment) => {
          const course = enrollment.course;
          const allLessons = course.modules.flatMap((m) => m.lessons);
          const totalLessons = allLessons.length;

          const progressRecords = await db.lessonProgress.findMany({
            where: {
              userId: req.user!.userId,
              lessonId: { in: allLessons.map((l) => l.id) },
              status: "completed",
            },
          });

          const completedLessons = progressRecords.length;
          const progress = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

          const lastProgress = await db.lessonProgress.findFirst({
            where: {
              userId: req.user!.userId,
              lessonId: { in: allLessons.map((l) => l.id) },
            },
            orderBy: { lastUpdated: "desc" },
          });

          return {
            id: course.id,
            title: course.title,
            slug: course.slug,
            description: course.description,
            coverImage: course.coverImage,
            progress,
            lastLessonId: lastProgress?.lessonId || null,
          };
        })
      );

      return NextResponse.json<ApiResponse>(
        {
          success: true,
          data: coursesWithProgress,
        },
        { status: 200 }
      );
    } catch (error) {
      console.error("Get my courses error:", error);
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Произошла ошибка при получении курсов",
          },
        },
        { status: 500 }
      );
    }
  });
}

