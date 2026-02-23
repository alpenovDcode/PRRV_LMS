import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";

export async function GET(request: NextRequest) {
  return withAuth(
    request,
    async () => {
      try {
        const { searchParams } = new URL(request.url);
        const courseId = searchParams.get("courseId");

        // Если указан courseId, возвращаем воронку проходимости для курса
        if (courseId) {
          const course = await db.course.findUnique({
            where: { id: courseId },
            include: {
              modules: {
                include: {
                  lessons: {
                    orderBy: { orderIndex: "asc" },
                  },
                },
                orderBy: { orderIndex: "asc" },
              },
            },
          });

          if (!course) {
            return NextResponse.json<ApiResponse>(
              {
                success: false,
                error: {
                  code: "NOT_FOUND",
                  message: "Курс не найден",
                },
              },
              { status: 404 }
            );
          }

          const allLessons = course.modules.flatMap((m) => m.lessons);
          const enrollments = await db.enrollment.findMany({
            where: {
              courseId,
              status: "active",
            },
          });

          // Воронка проходимости: сколько студентов прошли каждый урок
          const funnel = await Promise.all(
            allLessons.map(async (lesson, index) => {
              const completedCount = await db.lessonProgress.count({
                where: {
                  lessonId: lesson.id,
                  status: "completed",
                  userId: { in: enrollments.map((e) => e.userId) },
                },
              });

              const startedCount = await db.lessonProgress.count({
                where: {
                  lessonId: lesson.id,
                  status: { in: ["in_progress", "completed"] },
                  userId: { in: enrollments.map((e) => e.userId) },
                },
              });

              return {
                lessonId: lesson.id,
                lessonTitle: lesson.title,
                lessonNumber: index + 1,
                totalEnrollments: enrollments.length,
                started: startedCount,
                completed: completedCount,
                completionRate: enrollments.length > 0 ? Math.round((completedCount / enrollments.length) * 100) : 0,
              };
            })
          );

          // Вычисляем dropoffRate после получения всех данных
          const funnelWithDropoff = funnel.map((item, index) => {
            if (index > 0) {
              const prevItem = funnel[index - 1];
              const dropoff = prevItem.completed > 0
                ? Math.round(((prevItem.completed - item.completed) / prevItem.completed) * 100)
                : 0;
              return { ...item, dropoffRate: dropoff };
            }
            return { ...item, dropoffRate: 0 };
          });

          return NextResponse.json<ApiResponse>(
            {
              success: true,
              data: {
                course: {
                  id: course.id,
                  title: course.title,
                },
                funnel: funnelWithDropoff,
              },
            },
            { status: 200 }
          );
        }

        // Общая аналитика активности
        const now = new Date();
        const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        const [recentEnrollments, recentProgress, recentHomework] = await Promise.all([
          db.enrollment.count({
            where: {
              createdAt: { gte: last7Days },
            },
          }),
          db.lessonProgress.count({
            where: {
              lastUpdated: { gte: last7Days },
            },
          }),
          db.homeworkSubmission.count({
            where: {
              createdAt: { gte: last7Days },
            },
          }),
        ]);

        // Активность по дням (последние 7 дней)
        const dailyActivity = await Promise.all(
          Array.from({ length: 7 }, async (_, i) => {
            const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
            const startOfDay = new Date(date.setHours(0, 0, 0, 0));
            const endOfDay = new Date(date.setHours(23, 59, 59, 999));

            const [enrollments, progress, homework] = await Promise.all([
              db.enrollment.count({
                where: {
                  createdAt: { gte: startOfDay, lte: endOfDay },
                },
              }),
              db.lessonProgress.count({
                where: {
                  lastUpdated: { gte: startOfDay, lte: endOfDay },
                },
              }),
              db.homeworkSubmission.count({
                where: {
                  createdAt: { gte: startOfDay, lte: endOfDay },
                },
              }),
            ]);

            return {
              date: startOfDay.toISOString().split("T")[0],
              enrollments,
              progress,
              homework,
            };
          })
        );

        // Дополнительная статистика
        const [totalStudents, activeStudents, totalCourses, publishedCourses] = await Promise.all([
          db.user.count({ where: { role: "student" } }),
          db.user.count({
            where: {
              role: "student",
              enrollments: {
                some: {
                  status: "active",
                },
              },
            },
          }),
          db.course.count(),
          db.course.count({ where: { isPublished: true } }),
        ]);

        // Статистика по домашним заданиям
        const [pendingHomework, approvedHomework, rejectedHomework] = await Promise.all([
          db.homeworkSubmission.count({ where: { status: "pending" } }),
          db.homeworkSubmission.count({ where: { status: "approved" } }),
          db.homeworkSubmission.count({ where: { status: "rejected" } }),
        ]);

        // Средний прогресс по курсам
        const courseProgress = await db.course.findMany({
          where: { isPublished: true },
          include: {
            modules: {
              include: {
                lessons: {
                  select: { id: true },
                },
              },
            },
            enrollments: {
              where: { status: "active" },
              select: { userId: true },
            },
          },
        });

        const courseProgressStats = await Promise.all(
          courseProgress.map(async (course) => {
            const allLessons = course.modules.flatMap((m) => m.lessons);
            const totalLessons = allLessons.length;

            if (totalLessons === 0 || course.enrollments.length === 0) {
              return {
                courseId: course.id,
                courseTitle: course.title,
                averageProgress: 0,
                totalStudents: course.enrollments.length,
              };
            }

            const completedCounts = await Promise.all(
              allLessons.map((lesson) =>
                db.lessonProgress.count({
                  where: {
                    lessonId: lesson.id,
                    userId: { in: course.enrollments.map((e) => e.userId) },
                    status: "completed",
                  },
                })
              )
            );

            const totalCompleted = completedCounts.reduce((sum, count) => sum + count, 0);
            const totalPossible = totalLessons * course.enrollments.length;
            const averageProgress = totalPossible > 0 ? Math.round((totalCompleted / totalPossible) * 100) : 0;

            return {
              courseId: course.id,
              courseTitle: course.title,
              averageProgress,
              totalStudents: course.enrollments.length,
            };
          })
        );

        return NextResponse.json<ApiResponse>(
          {
            success: true,
            data: {
              overview: {
                totalStudents,
                activeStudents,
                totalCourses,
                publishedCourses,
              },
              homework: {
                pending: pendingHomework,
                approved: approvedHomework,
                rejected: rejectedHomework,
                total: pendingHomework + approvedHomework + rejectedHomework,
              },
              recentActivity: {
                enrollments: recentEnrollments,
                progress: recentProgress,
                homework: recentHomework,
              },
              dailyActivity: dailyActivity.reverse(), // От старых к новым
              courseProgress: courseProgressStats,
            },
          },
          { status: 200 }
        );
      } catch (error) {
        console.error("Analytics error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Произошла ошибка при получении аналитики",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}

