import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { buildProgressTransferPreview, type TransferLesson } from "@/lib/progress-transfer";
import { adminGroupTransferPreviewSchema } from "@/lib/validations";
import { ApiResponse } from "@/types";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    request,
    async () => {
      try {
        const { id: sourceGroupId } = await params;
        const { userId, targetGroupId } = adminGroupTransferPreviewSchema.parse(
          await request.json()
        );

        if (sourceGroupId === targetGroupId) {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: { code: "SAME_GROUP", message: "Выберите другую группу" },
            },
            { status: 400 }
          );
        }

        const [sourceMember, targetGroup] = await Promise.all([
          db.groupMember.findUnique({
            where: { groupId_userId: { groupId: sourceGroupId, userId } },
            select: {
              userId: true,
              group: {
                select: {
                  id: true,
                  name: true,
                  courseId: true,
                  course: { select: { id: true, title: true } },
                },
              },
            },
          }),
          db.group.findUnique({
            where: { id: targetGroupId },
            select: {
              id: true,
              name: true,
              courseId: true,
              course: { select: { id: true, title: true } },
            },
          }),
        ]);

        if (!sourceMember || !targetGroup) {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: {
                code: "NOT_FOUND",
                message: !sourceMember
                  ? "Участник не найден в исходной группе"
                  : "Целевая группа не найдена",
              },
            },
            { status: 404 }
          );
        }

        const sourceCourse = sourceMember.group.course;
        const targetCourse = targetGroup.course;
        if (!sourceCourse || !targetCourse) {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: {
                code: "COURSE_REQUIRED",
                message: "Для переноса прогресса обе группы должны быть связаны с курсами",
              },
            },
            { status: 400 }
          );
        }

        if (sourceCourse.id === targetCourse.id) {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: {
                code: "SAME_COURSE",
                message: "У групп один курс — перенос прогресса не требуется",
              },
            },
            { status: 400 }
          );
        }

        const lessonSelect = {
          id: true,
          title: true,
          type: true,
          orderIndex: true,
          module: {
            select: { id: true, title: true, orderIndex: true },
          },
        } as const;

        const [sourceRows, targetRows] = await Promise.all([
          db.lesson.findMany({
            where: { module: { courseId: sourceCourse.id } },
            select: lessonSelect,
            orderBy: [{ module: { orderIndex: "asc" } }, { orderIndex: "asc" }],
          }),
          db.lesson.findMany({
            where: { module: { courseId: targetCourse.id } },
            select: lessonSelect,
            orderBy: [{ module: { orderIndex: "asc" } }, { orderIndex: "asc" }],
          }),
        ]);

        const [sourceProgress, targetProgress] = await Promise.all([
          db.lessonProgress.findMany({
            where: { userId, lessonId: { in: sourceRows.map((lesson) => lesson.id) } },
            select: { lessonId: true, status: true, watchedTime: true, completedAt: true },
          }),
          db.lessonProgress.findMany({
            where: { userId, lessonId: { in: targetRows.map((lesson) => lesson.id) } },
            select: { lessonId: true, status: true, watchedTime: true, completedAt: true },
          }),
        ]);

        const sourceProgressByLesson = new Map(
          sourceProgress.map((progress) => [progress.lessonId, progress])
        );
        const targetProgressByLesson = new Map(
          targetProgress.map((progress) => [progress.lessonId, progress])
        );
        const toTransferLessons = (
          rows: typeof sourceRows,
          progressByLesson: Map<string, (typeof sourceProgress)[number]>
        ): TransferLesson[] =>
          rows.map((lesson) => {
            const progress = progressByLesson.get(lesson.id) ?? null;
            return {
              ...lesson,
              progress: progress
                ? {
                    status: progress.status,
                    watchedTime: progress.watchedTime,
                    completedAt: progress.completedAt,
                  }
                : null,
            };
          });

        const sourceLessons = toTransferLessons(sourceRows, sourceProgressByLesson);
        const targetLessons = toTransferLessons(targetRows, targetProgressByLesson);
        const preview = buildProgressTransferPreview(sourceLessons, targetLessons);

        return NextResponse.json<ApiResponse>(
          {
            success: true,
            data: {
              sourceGroup: { id: sourceMember.group.id, name: sourceMember.group.name },
              targetGroup: { id: targetGroup.id, name: targetGroup.name },
              sourceCourse,
              targetCourse,
              sourceLessons,
              targetLessons,
              ...preview,
            },
          },
          { status: 200 }
        );
      } catch (error) {
        if (error instanceof z.ZodError) {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: { code: "VALIDATION_ERROR", message: "Некорректные данные перевода" },
            },
            { status: 400 }
          );
        }

        console.error("Preview group member transfer error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Не удалось подготовить перенос прогресса",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}
