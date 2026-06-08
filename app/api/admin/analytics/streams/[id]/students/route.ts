import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    request,
    async () => {
      try {
        const { id: groupId } = await params;

        const group = await db.group.findUnique({
          where: { id: groupId },
          select: {
            id: true,
            name: true,
            course: {
              select: {
                modules: {
                  select: {
                    lessons: { select: { id: true } },
                  },
                },
              },
            },
            members: {
              select: {
                user: {
                  select: {
                    id: true,
                    email: true,
                    fullName: true,
                    progress: {
                      select: {
                        lessonId: true,
                        status: true,
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
        });

        if (!group) {
          return NextResponse.json<ApiResponse>(
            { success: false, error: { code: "NOT_FOUND", message: "Поток не найден" } },
            { status: 404 }
          );
        }

        const courseLessonIds = new Set<string>(
          group.course?.modules.flatMap((m) => m.lessons.map((l) => l.id)) ?? []
        );
        const totalLessons = courseLessonIds.size;

        const students = group.members.map(({ user }) => {
          const completedLessons = new Set(
            user.progress
              .filter((p) => courseLessonIds.has(p.lessonId) && p.status === "completed")
              .map((p) => p.lessonId)
          ).size;

          const courseHw = user.homework.filter((h) => h.lessonId && courseLessonIds.has(h.lessonId));
          const submittedHomework = courseHw.filter((h) => h.status !== "rejected").length;
          const approvedHomework = courseHw.filter((h) => h.status === "approved").length;

          // lastActivityAt scoped to this group's course lessons only
          let lastActivityAt: Date | null = null;
          for (const p of user.progress) {
            if (!courseLessonIds.has(p.lessonId)) continue;
            const d = new Date(p.lastUpdated);
            if (!lastActivityAt || d > lastActivityAt) lastActivityAt = d;
          }

          return {
            id: user.id,
            name: user.fullName || user.email,
            email: user.email,
            group: group.name,
            lessonProgressPercent: totalLessons > 0
              ? Math.round((completedLessons / totalLessons) * 100)
              : 0,
            completedLessons,
            totalLessons,
            submittedHomework,
            approvedHomework,
            lastActivityAt: lastActivityAt?.toISOString() ?? null,
          };
        });

        // Most inactive first — easiest for curators to spot problems
        students.sort((a, b) => {
          if (!a.lastActivityAt && !b.lastActivityAt) return 0;
          if (!a.lastActivityAt) return -1;
          if (!b.lastActivityAt) return 1;
          return new Date(a.lastActivityAt).getTime() - new Date(b.lastActivityAt).getTime();
        });

        return NextResponse.json<ApiResponse>({ success: true, data: students });
      } catch (error) {
        console.error("Stream students error:", error);
        return NextResponse.json<ApiResponse>(
          { success: false, error: { code: "INTERNAL_ERROR", message: "Не удалось получить студентов потока" } },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}
