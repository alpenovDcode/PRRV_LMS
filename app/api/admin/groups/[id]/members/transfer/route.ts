import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { withAuth } from "@/lib/api-middleware";
import { logAction } from "@/lib/audit";
import { db } from "@/lib/db";
import { moveEnrollmentToGroupStart } from "@/lib/group-enrollment";
import { createNotification } from "@/lib/notifications";
import { adminGroupTransferSchema } from "@/lib/validations";
import { ApiResponse } from "@/types";

/**
 * POST /api/admin/groups/[id]/members/transfer
 * Atomically transfers a student to another group. Learning records and
 * existing course enrollments are never deleted.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(
    request,
    async (req) => {
      try {
        const { id: sourceGroupId } = await params;
        const { userId, targetGroupId } = adminGroupTransferSchema.parse(await request.json());

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

          return { enrollmentAction };
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
          progressPreserved: true,
        });

        await createNotification(
          userId,
          "group_invite",
          "Перевод в другую группу",
          `Вы переведены из группы "${sourceMember.group.name}" в группу "${targetGroup.name}". Ваш прогресс сохранён.`,
          "/dashboard"
        );

        return NextResponse.json<ApiResponse>(
          {
            success: true,
            data: {
              sourceGroupId,
              targetGroupId,
              progressPreserved: true,
              enrollmentAction: result.enrollmentAction,
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
