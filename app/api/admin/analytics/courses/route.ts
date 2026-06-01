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
        const courses = await db.course.findMany({
          select: {
            id: true,
            title: true,
            _count: {
              select: {
                enrollments: true,
              },
            },
            enrollments: {
              select: {
                status: true,
              },
            },
            modules: {
              select: {
                lessons: {
                  select: {
                    progress: {
                      select: {
                        rating: true,
                      },
                    },
                  },
                },
              },
            },
          },
        });

        // Get per-student completion data for avg completion % per course
        const enrolledUsers = await db.enrollment.findMany({
          where: { status: "active" },
          select: {
            userId: true,
            courseId: true,
          },
        });

        // Group enrolled users by course
        const usersByCourse: Record<string, string[]> = {};
        for (const e of enrolledUsers) {
          if (!usersByCourse[e.courseId]) usersByCourse[e.courseId] = [];
          usersByCourse[e.courseId].push(e.userId);
        }

        const data = await Promise.all(
          courses.map(async (course: any) => {
            const totalEnrollments = course._count.enrollments;
            const activeEnrollments = course.enrollments.filter((e: any) => e.status === "active").length;

            // Collect all lesson IDs in this course
            const lessonIds: string[] = [];
            course.modules.forEach((m: any) => m.lessons.forEach((l: any) => lessonIds.push(l.id)));
            const totalLessons = lessonIds.length;
            const lessonIdSet = new Set(lessonIds);

            // Average lesson satisfaction rating (rename to clarify: students rate lessons)
            let totalRating = 0;
            let ratingCount = 0;
            course.modules.forEach((m: any) =>
              m.lessons.forEach((l: any) =>
                l.progress.forEach((p: any) => {
                  if (p.rating) { totalRating += p.rating; ratingCount++; }
                })
              )
            );
            const avgLessonRating = ratingCount > 0 ? Number((totalRating / ratingCount).toFixed(1)) : 0;

            // Average completion % across active enrollments
            let avgCompletionPercent = 0;
            const enrolledUserIds = usersByCourse[course.id] ?? [];
            if (enrolledUserIds.length > 0 && totalLessons > 0) {
              const progresses = await db.lessonProgress.findMany({
                where: {
                  userId: { in: enrolledUserIds },
                  lessonId: { in: lessonIds },
                  status: "completed",
                },
                select: { userId: true },
              });

              // Count completed lessons per user
              const completedPerUser: Record<string, number> = {};
              for (const p of progresses) {
                completedPerUser[p.userId] = (completedPerUser[p.userId] ?? 0) + 1;
              }
              const sumPercents = enrolledUserIds.reduce(
                (acc, uid) => acc + ((completedPerUser[uid] ?? 0) / totalLessons),
                0
              );
              avgCompletionPercent = Math.round((sumPercents / enrolledUserIds.length) * 100);
            }

            return {
              id: course.id,
              title: course.title,
              totalEnrollments,
              activeEnrollments,
              totalLessons,
              avgLessonRating,
              avgCompletionPercent,
            };
          })
        );

        return NextResponse.json<ApiResponse>({ success: true, data }, { status: 200 });
      } catch (error) {
        console.error("Analytics courses error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Не удалось получить данные о курсах",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}
