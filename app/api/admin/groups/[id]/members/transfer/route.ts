import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { withAuth } from "@/lib/api-middleware";
import { logAction } from "@/lib/audit";
import { db } from "@/lib/db";
import { moveEnrollmentToGroupStart } from "@/lib/group-enrollment";
import { createNotification } from "@/lib/notifications";
import { adminGroupTransferSchema } from "@/lib/validations";
import { mergeProgress, validateProgressMappings } from "@/lib/progress-transfer";
import { ApiResponse } from "@/types";

class InvalidProgressMappingError extends Error {}

/**
 * POST /api/admin/groups/[id]/members/transfer
 * Atomically transfers a student to another group. Learning records are
 * preserved; source course access is revoked only when explicitly requested.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(
    request,
    async (req) => {
      try {
        const { id: sourceGroupId } = await params;
        const {
          userId,
          targetGroupId,
          revokeSourceEnrollment = false,
          progressMappings = [],
        } = adminGroupTransferSchema.parse(await request.json());

        if (sourceGroupId === targetGroupId) {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: { code: "SAME_GROUP", message: "Выберите другую группу" },
            },
            { status: 400 }
          );
        }

        const [sourceMember, targetGroup, existingTargetMember] = await Promise.all([
          db.groupMember.findUnique({
            where: { groupId_userId: { groupId: sourceGroupId, userId } },
            include: {
              group: { select: { id: true, name: true, courseId: true } },
              user: { select: { email: true } },
            },
          }),
          db.group.findUnique({
            where: { id: targetGroupId },
            select: { id: true, name: true, courseId: true, startDate: true },
          }),
          db.groupMember.findUnique({
            where: { groupId_userId: { groupId: targetGroupId, userId } },
            select: { id: true },
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

        if (existingTargetMember) {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: {
                code: "ALREADY_MEMBER",
                message: "Пользователь уже состоит в выбранной группе",
              },
            },
            { status: 400 }
          );
        }

        const result = await db.$transaction(async (tx) => {
          await tx.groupMember.create({ data: { groupId: targetGroupId, userId } });
          await tx.groupMember.delete({
            where: { groupId_userId: { groupId: sourceGroupId, userId } },
          });

          let enrollmentAction: "unchanged" | "created" | "updated" = "unchanged";
          if (targetGroup.courseId) {
            const enrollment = await tx.enrollment.findUnique({
              where: { userId_courseId: { userId, courseId: targetGroup.courseId } },
            });

            if (enrollment) {
              const dates = moveEnrollmentToGroupStart(enrollment, targetGroup.startDate);
              await tx.enrollment.update({
                where: { id: enrollment.id },
                data: {
                  status: "active",
                  startDate: dates.startDate,
                  expiresAt: dates.expiresAt,
                },
              });
              enrollmentAction = "updated";
            } else {
              await tx.enrollment.create({
                data: {
                  userId,
                  courseId: targetGroup.courseId,
                  status: "active",
                  startDate: targetGroup.startDate ?? new Date(),
                },
              });
              enrollmentAction = "created";
            }
          }

          let transferredLessons = 0;
          if (progressMappings.length > 0) {
            const sourceCourseId = sourceMember.group.courseId;
            const targetCourseId = targetGroup.courseId;
            if (!sourceCourseId || !targetCourseId) {
              throw new InvalidProgressMappingError(
                "Для переноса прогресса обе группы должны быть связаны с курсами"
              );
            }

            const sourceLessonIds = progressMappings.map((mapping) => mapping.sourceLessonId);
            const targetLessonIds = progressMappings.map((mapping) => mapping.targetLessonId);
            const [sourceLessons, targetLessons] = await Promise.all([
              tx.lesson.findMany({
                where: {
                  id: { in: sourceLessonIds },
                  module: { courseId: sourceCourseId },
                },
                select: { id: true },
              }),
              tx.lesson.findMany({
                where: {
                  id: { in: targetLessonIds },
                  module: { courseId: targetCourseId },
                },
                select: { id: true },
              }),
            ]);

            try {
              validateProgressMappings(progressMappings, sourceLessons, targetLessons);
            } catch (error) {
              throw new InvalidProgressMappingError(
                error instanceof Error ? error.message : "Некорректное сопоставление уроков"
              );
            }

            const [sourceProgressRows, targetProgressRows] = await Promise.all([
              tx.lessonProgress.findMany({
                where: { userId, lessonId: { in: sourceLessonIds } },
                select: {
                  lessonId: true,
                  status: true,
                  watchedTime: true,
                  completedAt: true,
                },
              }),
              tx.lessonProgress.findMany({
                where: { userId, lessonId: { in: targetLessonIds } },
                select: {
                  lessonId: true,
                  status: true,
                  watchedTime: true,
                  completedAt: true,
                },
              }),
            ]);
            const sourceProgressByLesson = new Map(
              sourceProgressRows.map((progress) => [progress.lessonId, progress])
            );
            const targetProgressByLesson = new Map(
              targetProgressRows.map((progress) => [progress.lessonId, progress])
            );

            for (const mapping of progressMappings) {
              const sourceProgress = sourceProgressByLesson.get(mapping.sourceLessonId);
              if (!sourceProgress || sourceProgress.status === "not_started") continue;

              const targetProgress = targetProgressByLesson.get(mapping.targetLessonId) ?? null;
              const merged = mergeProgress(sourceProgress, targetProgress);
              await tx.lessonProgress.upsert({
                where: {
                  userId_lessonId: { userId, lessonId: mapping.targetLessonId },
                },
                update: merged,
                create: {
                  userId,
                  lessonId: mapping.targetLessonId,
                  ...merged,
                },
              });
              transferredLessons += 1;
            }
          }

          let sourceEnrollmentRevoked = false;
          if (
            revokeSourceEnrollment &&
            sourceMember.group.courseId &&
            sourceMember.group.courseId !== targetGroup.courseId
          ) {
            const revoked = await tx.enrollment.deleteMany({
              where: { userId, courseId: sourceMember.group.courseId },
            });
            sourceEnrollmentRevoked = revoked.count > 0;
          }

          return { enrollmentAction, sourceEnrollmentRevoked, transferredLessons };
        });

        await logAction(req.user!.userId, "TRANSFER_GROUP_MEMBER", "group", targetGroupId, {
          userId,
          userEmail: sourceMember.user.email,
          sourceGroupId,
          sourceGroupName: sourceMember.group.name,
          targetGroupId,
          targetGroupName: targetGroup.name,
          sourceCourseId: sourceMember.group.courseId,
          targetCourseId: targetGroup.courseId,
          enrollmentAction: result.enrollmentAction,
          historyPreserved: true,
          sourceEnrollmentRevoked: result.sourceEnrollmentRevoked,
          transferredLessons: result.transferredLessons,
          skippedLessons: progressMappings.length - result.transferredLessons,
        });

        await createNotification(
          userId,
          "group_invite",
          "Перевод в другую группу",
          `Вы переведены из группы "${sourceMember.group.name}" в группу "${targetGroup.name}". История обучения сохранена.`,
          "/dashboard"
        );

        return NextResponse.json<ApiResponse>(
          {
            success: true,
            data: {
              sourceGroupId,
              targetGroupId,
              historyPreserved: true,
              enrollmentAction: result.enrollmentAction,
              sourceEnrollmentRevoked: result.sourceEnrollmentRevoked,
              transferredLessons: result.transferredLessons,
              skippedLessons: progressMappings.length - result.transferredLessons,
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

        if (error instanceof InvalidProgressMappingError) {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: { code: "INVALID_PROGRESS_MAPPING", message: error.message },
            },
            { status: 400 }
          );
        }

        console.error("Transfer group member error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: { code: "INTERNAL_ERROR", message: "Не удалось перевести участника" },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}
