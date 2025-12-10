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

      const allLessons = enrollments.flatMap((e) =>
        e.course.modules.flatMap((m) => m.lessons)
      );
      const totalLessons = allLessons.length;

      const completedLessons = await db.lessonProgress.count({
        where: {
          userId: req.user!.userId,
          lessonId: { in: allLessons.map((l) => l.id) },
          status: "completed",
        },
      });

      let completedCourses = 0;
      let inProgress = 0;

      for (const enrollment of enrollments) {
        const courseLessons = enrollment.course.modules.flatMap((m) => m.lessons);
        const courseTotal = courseLessons.length;

        if (courseTotal > 0) {
          const courseCompleted = await db.lessonProgress.count({
            where: {
              userId: req.user!.userId,
              lessonId: { in: courseLessons.map((l) => l.id) },
              status: "completed",
            },
          });

          const progress = (courseCompleted / courseTotal) * 100;
          if (progress === 100) {
            completedCourses++;
          } else if (progress > 0) {
            inProgress++;
          }
        }
      }

      return NextResponse.json<ApiResponse>(
        {
          success: true,
          data: {
            totalCourses: enrollments.length,
            inProgress,
            completed: completedCourses,
            totalLessons,
            completedLessons,
          },
        },
        { status: 200 }
      );
    } catch (error) {
      console.error("Get dashboard stats error:", error);
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Произошла ошибка при получении статистики",
          },
        },
        { status: 500 }
      );
    }
  });
}

