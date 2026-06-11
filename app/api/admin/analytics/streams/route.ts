import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";
import { rangeToFromDate } from "@/lib/analytics-range";
import { subDays } from "date-fns";

export async function GET(request: NextRequest) {
  return withAuth(
    request,
    async () => {
      try {
        const url = new URL(request.url);
        const range = url.searchParams.get("range") ?? "30d";
        const activeThreshold = rangeToFromDate(range) ?? subDays(new Date(), 30);

        const groups = await db.group.findMany({
          select: {
            id: true,
            name: true,
            courseId: true,
            course: {
              select: {
                id: true,
                title: true,
                modules: {
                  select: {
                    lessons: {
                      select: { id: true, type: true },
                    },
                  },
                },
              },
            },
            members: {
              select: {
                user: {
                  select: {
                    id: true,
                    progress: {
                      select: {
                        lessonId: true,
                        status: true,
                        watchedTime: true,
                        lastUpdated: true,
                      },
                    },
                    homework: {
                      select: {
                        status: true,
                        lessonId: true,
                      },
                    },
                  },
                },
              },
            },
          },
          orderBy: { name: "asc" },
        });

        const data = groups.map((group) => {
          const members = group.members;
          const memberCount = members.length;

          if (memberCount === 0) {
            return {
              id: group.id,
              name: group.name,
              courseTitle: group.course?.title ?? null,
              memberCount: 0,
              activePercent: 0,
              videoStats: { notStarted: 0, partial: 0, completed: 0 },
              hwStats: { submittedCount: 0, pendingCount: 0, approvedCount: 0, approvedPercent: 0 },
              avgCourseProgressPercent: 0,
            };
          }

          // Flatten all course lessons
          const courseLessons = group.course?.modules.flatMap((m) => m.lessons) ?? [];
          const courseLessonIds = new Set(courseLessons.map((l) => l.id));
          const videoLessonIds = new Set(
            courseLessons.filter((l) => l.type === "video").map((l) => l.id)
          );
          const totalLessonsInCourse = courseLessonIds.size;
          const totalVideoLessonsInCourse = videoLessonIds.size;

          // === 1. Activity: % of students active in last N days (only on THIS course's lessons) ===
          let activeCount = 0;
          for (const { user } of members) {
            const wasActive = user.progress.some(
              (p) => courseLessonIds.has(p.lessonId) && new Date(p.lastUpdated) > activeThreshold
            );
            if (wasActive) activeCount++;
          }
          const activePercent =
            memberCount > 0 ? Math.round((activeCount / memberCount) * 100) : 0;

          // === 2. Video stats ===
          let totalVideoSlots = 0;
          let notStartedVideo = 0;
          let partialVideo = 0;
          let completedVideo = 0;

          if (totalVideoLessonsInCourse > 0) {
            for (const { user } of members) {
              const progressMap = new Map(
                user.progress.map((p) => [p.lessonId, p])
              );
              for (const videoId of videoLessonIds) {
                totalVideoSlots++;
                const p = progressMap.get(videoId);
                if (!p || (p.status === "not_started" && p.watchedTime === 0)) {
                  notStartedVideo++;
                } else if (p.status === "completed") {
                  completedVideo++;
                } else {
                  partialVideo++;
                }
              }
            }
          }

          const videoStats =
            totalVideoSlots > 0
              ? {
                  notStarted: Math.round((notStartedVideo / totalVideoSlots) * 100),
                  partial: Math.round((partialVideo / totalVideoSlots) * 100),
                  completed: Math.round((completedVideo / totalVideoSlots) * 100),
                }
              : { notStarted: 0, partial: 0, completed: 0 };

          // === 3. Homework stats ===
          // submittedCount = pending + approved only (rejected = student must resubmit, don't count)
          let totalSubmissions = 0;
          let pendingCount = 0;
          let approvedCount = 0;
          for (const { user } of members) {
            const courseHw = group.course
              ? user.homework.filter((h) => h.lessonId && courseLessonIds.has(h.lessonId))
              : user.homework;
            const activeHw = courseHw.filter((h) => h.status !== "rejected");
            totalSubmissions += activeHw.length;
            pendingCount += activeHw.filter((h) => h.status === "pending").length;
            approvedCount += activeHw.filter((h) => h.status === "approved").length;
          }
          const approvedPercent =
            totalSubmissions > 0
              ? Math.round((approvedCount / totalSubmissions) * 100)
              : 0;

          // === 4. Avg course progress % ===
          let sumProgress = 0;
          for (const { user } of members) {
            if (totalLessonsInCourse === 0) continue;
            // Deduplicate by lessonId so retaken lessons don't inflate the count
            const completedCount = new Set(
              user.progress
                .filter((p) => courseLessonIds.has(p.lessonId) && p.status === "completed")
                .map((p) => p.lessonId)
            ).size;
            sumProgress += completedCount / totalLessonsInCourse;
          }
          const avgCourseProgressPercent =
            memberCount > 0 && totalLessonsInCourse > 0
              ? Math.round((sumProgress / memberCount) * 100)
              : 0;

          return {
            id: group.id,
            name: group.name,
            courseTitle: group.course?.title ?? null,
            memberCount,
            activePercent,
            videoStats,
            hwStats: {
              submittedCount: totalSubmissions,
              pendingCount,
              approvedCount,
              approvedPercent,
            },
            avgCourseProgressPercent,
          };
        });

        return NextResponse.json<ApiResponse>({ success: true, data }, { status: 200 });
      } catch (error) {
        console.error("Analytics streams error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Не удалось получить статистику по потокам",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}
