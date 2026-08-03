import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";
import { adminGroupCreateSchema } from "@/lib/validations";
import { logAction } from "@/lib/audit";
import { moveEnrollmentToGroupStart } from "@/lib/group-enrollment";
import { z } from "zod";

const updateGroupSchema = adminGroupCreateSchema.partial().extend({
  courseId: z.string().nullable().optional(),
  startDate: z.string().datetime().nullable().optional(),
});

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(
    request,
    async () => {
      const { id } = await params;
      try {
        const group = await db.group.findUnique({
          where: { id },
          include: {
            _count: {
              select: { members: true },
            },
            members: {
              include: {
                user: {
                  select: {
                    id: true,
                    email: true,
                    fullName: true,
                    role: true,
                  },
                },
              },
              take: 10, // Первые 10 для предпросмотра
            },
          },
        });

        if (!group) {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: {
                code: "NOT_FOUND",
                message: "Группа не найдена",
              },
            },
            { status: 404 }
          );
        }

        return NextResponse.json<ApiResponse>({ success: true, data: group }, { status: 200 });
      } catch (error) {
        console.error("Get group error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Не удалось получить группу",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(
    request,
    async (req) => {
      try {
        const { id } = await params;
        const body = await request.json();
        const parsed = updateGroupSchema.parse(body);

        // Проверяем существование группы
        const existingGroup = await db.group.findUnique({
          where: { id },
        });

        if (!existingGroup) {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: {
                code: "NOT_FOUND",
                message: "Группа не найдена",
              },
            },
            { status: 404 }
          );
        }

        const group = await db.$transaction(async (tx) => {
          const updatedGroup = await tx.group.update({
            where: { id },
            data: {
              name: parsed.name,
              description: parsed.description,
              ...(parsed.courseId !== undefined ? { courseId: parsed.courseId } : {}),
              ...(parsed.startDate !== undefined
                ? { startDate: parsed.startDate ? new Date(parsed.startDate) : null }
                : {}),
            },
          });

          // Keep current learning records and align each member's enrollment
          // with the newly configured group schedule.
          if (
            updatedGroup.courseId &&
            (parsed.courseId !== undefined || parsed.startDate !== undefined)
          ) {
            const members = await tx.groupMember.findMany({
              where: { groupId: id },
              select: { userId: true },
            });

            for (const member of members) {
              const enrollment = await tx.enrollment.findUnique({
                where: {
                  userId_courseId: {
                    userId: member.userId,
                    courseId: updatedGroup.courseId,
                  },
                },
              });

              if (enrollment) {
                const dates = moveEnrollmentToGroupStart(enrollment, updatedGroup.startDate);
                await tx.enrollment.update({
                  where: { id: enrollment.id },
                  data: {
                    status: "active",
                    startDate: dates.startDate,
                    expiresAt: dates.expiresAt,
                  },
                });
              } else {
                await tx.enrollment.create({
                  data: {
                    userId: member.userId,
                    courseId: updatedGroup.courseId,
                    status: "active",
                    startDate: updatedGroup.startDate ?? new Date(),
                  },
                });
              }
            }
          }

          return updatedGroup;
        });

        // Audit log
        await logAction(req.user!.userId, "UPDATE_GROUP", "group", group.id, {
          name: group.name,
        });

        return NextResponse.json<ApiResponse>({ success: true, data: group }, { status: 200 });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: {
                code: "VALIDATION_ERROR",
                message: "Некорректные данные группы",
              },
            },
            { status: 400 }
          );
        }

        console.error("Update group error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Не удалось обновить группу",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    request,
    async (req) => {
      try {
        const { id } = await params;
        // Получаем информацию о группе перед удалением для audit log
        const group = await db.group.findUnique({
          where: { id },
          select: { id: true, name: true, _count: { select: { members: true } } },
        });

        if (!group) {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: {
                code: "NOT_FOUND",
                message: "Группа не найдена",
              },
            },
            { status: 404 }
          );
        }

        // Проверяем, есть ли участники
        if (group._count.members > 0) {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: {
                code: "HAS_MEMBERS",
                message:
                  "Невозможно удалить группу с участниками. Сначала удалите всех участников.",
              },
            },
            { status: 400 }
          );
        }

        await db.group.delete({
          where: { id },
        });

        // Audit log
        await logAction(req.user!.userId, "DELETE_GROUP", "group", group.id, {
          name: group.name,
        });

        return NextResponse.json<ApiResponse>({ success: true }, { status: 200 });
      } catch (error) {
        console.error("Delete group error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Не удалось удалить группу",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}
