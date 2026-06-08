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
        // 1. Fetch all courses with their lesson structure
        const courses = await db.course.findMany({
          select: {
            id: true,
            title: true,
            modules: {
              select: {
                lessons: { select: { id: true } },
              },
            },
          },
        });

        // 2. Build course ↔ lesson maps
        const courseLessonIds: Record<string, string[]> = {};
        const lessonCourseMap: Record<string, string> = {};
        for (const course of courses) {
          courseLessonIds[course.id] = [];
          for (const mod of course.modules) {
            for (const lesson of mod.lessons) {
              courseLessonIds[course.id].push(lesson.id);
              lessonCourseMap[lesson.id] = course.id;
            }
          }
        }
        const allLessonIds = Object.keys(lessonCourseMap);

        // 3. Fetch all active enrollments in one query
        const enrollments = await db.enrollment.findMany({
          where: { status: "active" },
          select: { userId: true, courseId: true },
        });

        const enrolledUsersByCourse: Record<string, Set<string>> = {};
        for (const e of enrollments) {
          if (!enrolledUsersByCourse[e.courseId]) enrolledUsersByCourse[e.courseId] = new Set();
          enrolledUsersByCourse[e.courseId].add(e.userId);
        }
        const allEnrolledUserIds = [...new Set(enrollments.map((e) => e.userId))];

        if (allLessonIds.length === 0 || allEnrolledUserIds.length === 0) {
          const data = courses.map((c) => ({
            id: c.id,
            title: c.title,
            totalEnrollments: enrolledUsersByCourse[c.id]?.size ?? 0,
            activeEnrollments: enrolledUsersByCourse[c.id]?.size ?? 0,
            totalLessons: courseLessonIds[c.id].length,
            avgLessonRating: 0,
            avgCompletionPercent: 0,
          }));
          return NextResponse.json<ApiResponse>({ success: true, data }, { status: 200 });
        }

        // 4. Fetch ALL completed progress in ONE query, deduplicated by (userId, lessonId)
        const completedProgress = await db.lessonProgress.findMany({
          where: {
            userId: { in: allEnrolledUserIds },
            lessonId: { in: allLessonIds },
            status: "completed",
          },
          select: { userId: true, lessonId: true },
          distinct: ["userId", "lessonId"],
        });

        // Group: courseId → userId → Set<lessonId>
        const completedByCourseUser: Record<string, Record<string, Set<string>>> = {};
        for (const p of completedProgress) {
          const courseId = lessonCourseMap[p.lessonId];
          if (!courseId) continue;
          if (!completedByCourseUser[courseId]) completedByCourseUser[courseId] = {};
          if (!completedByCourseUser[courseId][p.userId]) completedByCourseUser[courseId][p.userId] = new Set();
          completedByCourseUser[courseId][p.userId].add(p.lessonId);
        }

        // 5. Fetch all ratings in ONE query — only from enrolled users
        const ratingRecords = await db.lessonProgress.findMany({
          where: {
            userId: { in: allEnrolledUserIds },
            lessonId: { in: allLessonIds },
            rating: { not: null, gt: 0 },
          },
          select: { userId: true, lessonId: true, rating: true },
        });

        const ratingsByCourse: Record<string, number[]> = {};
        for (const p of ratingRecords) {
          const courseId = lessonCourseMap[p.lessonId];
          if (!courseId) continue;
          // Only include ratings from users actually enrolled in this course
          if (!enrolledUsersByCourse[courseId]?.has(p.userId)) continue;
          if (!ratingsByCourse[courseId]) ratingsByCourse[courseId] = [];
          ratingsByCourse[courseId].push(p.rating!);
        }

        // 6. Assemble response
        const data = courses.map((course) => {
          const enrolledUsers = enrolledUsersByCourse[course.id] ?? new Set<string>();
          const totalLessons = courseLessonIds[course.id].length;

          let avgCompletionPercent = 0;
          if (enrolledUsers.size > 0 && totalLessons > 0) {
            let totalPct = 0;
            for (const userId of enrolledUsers) {
              const completedCount = completedByCourseUser[course.id]?.[userId]?.size ?? 0;
              totalPct += completedCount / totalLessons;
            }
            avgCompletionPercent = Math.round((totalPct / enrolledUsers.size) * 100);
          }

          const courseRatings = ratingsByCourse[course.id] ?? [];
          const avgLessonRating =
            courseRatings.length > 0
              ? Number((courseRatings.reduce((a, b) => a + b, 0) / courseRatings.length).toFixed(1))
              : 0;

          return {
            id: course.id,
            title: course.title,
            totalEnrollments: enrolledUsers.size,
            activeEnrollments: enrolledUsers.size,
            totalLessons,
            avgLessonRating,
            avgCompletionPercent,
          };
        });

        return NextResponse.json<ApiResponse>({ success: true, data }, { status: 200 });
      } catch (error) {
        console.error("Analytics courses error:", error);
        return NextResponse.json<ApiResponse>(
          { success: false, error: { code: "INTERNAL_ERROR", message: "Не удалось получить данные о курсах" } },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}
