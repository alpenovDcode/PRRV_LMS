import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { calculateCuratorRisk } from "@/lib/curator-risk";

export async function GET(request: NextRequest) {
  return withAuth(
    request,
    async (req) => {
      const requestedGroupId = new URL(request.url).searchParams.get("groupId");
      const isAdmin = req.user!.role === UserRole.admin;
      const accessWhere = isAdmin
        ? {}
        : { curators: { some: { curatorId: req.user!.userId, isActive: true } } };

      const availableGroups = await db.group.findMany({
        where: accessWhere,
        select: {
          id: true,
          name: true,
          course: { select: { title: true } },
          _count: { select: { members: true } },
        },
        orderBy: { name: "asc" },
      });
      const selectedId =
        requestedGroupId && availableGroups.some((group) => group.id === requestedGroupId)
          ? requestedGroupId
          : availableGroups[0]?.id;
      if (!selectedId) {
        return NextResponse.json({
          success: true,
          data: {
            groups: availableGroups,
            selectedGroup: null,
            students: [],
            summary: emptySummary(),
          },
        });
      }

      const group = await db.group.findFirst({
        where: { id: selectedId, ...accessWhere },
        select: {
          id: true,
          name: true,
          startDate: true,
          courseId: true,
          course: {
            select: {
              title: true,
              modules: {
                select: {
                  id: true,
                  title: true,
                  orderIndex: true,
                  lessons: {
                    select: {
                      id: true,
                      title: true,
                      type: true,
                      noHomework: true,
                      orderIndex: true,
                    },
                    orderBy: { orderIndex: "asc" },
                  },
                },
                orderBy: { orderIndex: "asc" },
              },
            },
          },
          members: {
            select: {
              user: {
                select: {
                  id: true,
                  fullName: true,
                  email: true,
                  telegram: true,
                  lastActiveAt: true,
                  createdAt: true,
                  enrollments: { select: { courseId: true, startDate: true } },
                  progress: { select: { lessonId: true, status: true, lastUpdated: true } },
                  homework: { select: { lessonId: true, createdAt: true } },
                  notifications: {
                    where: { type: "module_unlocked" },
                    select: { createdAt: true },
                    orderBy: { createdAt: "desc" },
                    take: 1,
                  },
                },
              },
            },
          },
        },
      });
      if (!group) {
        return NextResponse.json(
          {
            success: false,
            error: { code: "FORBIDDEN", message: "Группа не закреплена за куратором" },
          },
          { status: 403 }
        );
      }

      const lessons = group.course?.modules.flatMap((module) => module.lessons) ?? [];
      const lessonIds = new Set(lessons.map((lesson) => lesson.id));
      const homeworkLessonIds = new Set(
        lessons.filter((lesson) => !lesson.noHomework).map((lesson) => lesson.id)
      );
      const certificationIds = new Set(
        lessons.filter((lesson) => lesson.type === "certification_form").map((lesson) => lesson.id)
      );
      const now = new Date();
      const students = group.members.map(({ user }) => {
        const progress = user.progress.filter((item) => lessonIds.has(item.lessonId));
        const completed = progress.filter((item) => item.status === "completed");
        const homework = user.homework.filter(
          (item) => item.lessonId && homeworkLessonIds.has(item.lessonId)
        );
        const lastLearningActionAt =
          [
            ...progress.map((item) => item.lastUpdated),
            ...homework.map((item) => item.createdAt),
          ].sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
        const enrollment = user.enrollments.find((item) => item.courseId === group.courseId);
        const risk = calculateCuratorRisk({
          now,
          enrolledAt: enrollment?.startDate ?? group.startDate ?? user.createdAt,
          lastActiveAt: user.lastActiveAt,
          lastLearningActionAt,
          completedLessons: completed.length,
          totalLessons: lessons.length,
          homeworkCount: homework.length,
          hasHomeworkLessons: homeworkLessonIds.size > 0,
          hasCertification: certificationIds.size > 0,
          certificationCompleted: completed.some((item) => certificationIds.has(item.lessonId)),
          latestModuleNotificationAt: user.notifications[0]?.createdAt ?? null,
        });
        const currentLesson = [...progress].sort(
          (a, b) => b.lastUpdated.getTime() - a.lastUpdated.getTime()
        )[0];
        const currentModule = currentLesson
          ? group.course?.modules.find((module) =>
              module.lessons.some((lesson) => lesson.id === currentLesson.lessonId)
            )
          : null;
        return {
          id: user.id,
          fullName: user.fullName,
          email: user.email,
          telegram: user.telegram,
          lastActiveAt: user.lastActiveAt,
          progressPercent: lessons.length
            ? Math.round((completed.length / lessons.length) * 100)
            : 0,
          completedLessons: completed.length,
          totalLessons: lessons.length,
          homeworkCount: homework.length,
          currentStage: currentModule?.title ?? "Не начал обучение",
          ...risk,
        };
      });
      const summary = students.reduce((acc, student) => {
        acc[student.level]++;
        for (const signal of student.signals)
          acc.triggers[signal.code] = (acc.triggers[signal.code] ?? 0) + 1;
        return acc;
      }, emptySummary());

      return NextResponse.json({
        success: true,
        data: {
          groups: availableGroups,
          selectedGroup: {
            id: group.id,
            name: group.name,
            courseTitle: group.course?.title ?? null,
          },
          students: students.sort((a, b) => b.score - a.score),
          summary,
          pendingIntegrations: ["Посещаемость встреч", "Активация внешних сервисов"],
        },
      });
    },
    { roles: [UserRole.curator, UserRole.admin] }
  );
}

function emptySummary() {
  return { green: 0, yellow: 0, red: 0, triggers: {} as Record<string, number> };
}
