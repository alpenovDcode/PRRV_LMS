import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";
import { adminGroupMemberSchema } from "@/lib/validations";
import { createNotification } from "@/lib/notifications";
import { logAction } from "@/lib/audit";



export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    request,
    async () => {
        const { id } = await params;
      try {
        const members = await db.groupMember.findMany({
          where: { groupId: id },
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
          orderBy: { createdAt: "desc" },
        });

        return NextResponse.json<ApiResponse>({ success: true, data: members }, { status: 200 });
      } catch (error) {
        console.error("Get group members error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Не удалось получить список участников группы",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin] }
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    request,
    async (req) => {
      try {
        const { id } = await params;
        const body = await request.json();
        const { userId } = adminGroupMemberSchema.parse(body);

        // Проверяем существование группы
        const group = await db.group.findUnique({
          where: { id },
          select: { id: true, name: true },
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

        // Проверяем существование пользователя
        const user = await db.user.findUnique({
          where: { id: userId },
          select: { id: true, email: true },
        });

        if (!user) {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: {
                code: "NOT_FOUND",
                message: "Пользователь не найден",
              },
            },
            { status: 404 }
          );
        }

        // Используем транзакцию для атомарной операции
        const member = await db.$transaction(async (tx) => {
          // Проверяем, не является ли пользователь уже участником
          const existingMember = await tx.groupMember.findUnique({
            where: {
              groupId_userId: {
                groupId: id,
                userId,
              },
            },
          });

          if (existingMember) {
            throw new Error("ALREADY_MEMBER");
          }

          // Создаем участника группы
          const newMember = await tx.groupMember.create({
            data: {
              groupId: id,
              userId,
            },
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
          });

          // Если у группы есть курс, проверяем зачисление
          const groupWithCourse = await tx.group.findUnique({
            where: { id },
            select: { courseId: true, startDate: true },
          });

          if (groupWithCourse?.courseId) {
            const existingEnrollment = await tx.enrollment.findUnique({
              where: {
                userId_courseId: {
                  userId,
                  courseId: groupWithCourse.courseId,
                },
              },
            });

            if (!existingEnrollment) {
              await tx.enrollment.create({
                data: {
                  userId,
                  courseId: groupWithCourse.courseId,
                  startDate: groupWithCourse.startDate || new Date(),
                  status: "active",
                },
              });
            }
          }

          return newMember;
        });

        // Audit log
        await logAction(req.user!.userId, "ADD_GROUP_MEMBER", "group", id, {
          userId,
          userEmail: user.email,
          groupName: group.name,
        });

        // Send notification
        const { createNotification } = await import("@/lib/notifications");
        
        let message = `Вы были добавлены в группу "${group.name}"`;
        let link = "/dashboard";

        // Check if group has a course to provide better context
        const groupWithCourse = await db.group.findUnique({
          where: { id },
          include: { course: { select: { title: true, slug: true } } }
        });

        if (groupWithCourse?.course) {
          message += ` и зачислены на курс "${groupWithCourse.course.title}"`;
          link = `/courses/${groupWithCourse.course.slug}`;
        }

        await createNotification(
          userId,
          "group_invite",
          "Вас добавили в группу",
          message,
          link
        );

        return NextResponse.json<ApiResponse>({ success: true, data: member }, { status: 201 });
      } catch (error) {
        if (error instanceof Error && error.message === "ALREADY_MEMBER") {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: {
                code: "ALREADY_MEMBER",
                message: "Пользователь уже является участником группы",
              },
            },
            { status: 400 }
          );
        }

        console.error("Add group member error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Не удалось добавить пользователя в группу",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin] }
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
        const { searchParams } = new URL(request.url);
        const userId = searchParams.get("userId");

        if (!userId) {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: {
                code: "VALIDATION_ERROR",
                message: "userId обязателен для удаления участника",
              },
            },
            { status: 400 }
          );
        }

        // Получаем информацию перед удалением для audit log и уведомления
        const member = await db.groupMember.findUnique({
          where: {
            groupId_userId: {
              groupId: id,
              userId,
            },
          },
          include: {
            group: { select: { name: true, courseId: true, course: { select: { title: true } } } },
            user: { select: { email: true } },
          },
        });

        if (!member) {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: {
                code: "NOT_FOUND",
                message: "Участник не найден в группе",
              },
            },
            { status: 404 }
          );
        }

        // Используем транзакцию для атомарного удаления участника и доступа к курсу
        await db.$transaction(async (tx) => {
          // Удаляем участника из группы
          await tx.groupMember.delete({
            where: {
              groupId_userId: {
                groupId: id,
                userId,
              },
            },
          });

          // Если у группы есть курс, удаляем доступ (enrollment)
          if (member.group.courseId) {
            await tx.enrollment.deleteMany({
              where: {
                userId,
                courseId: member.group.courseId,
              },
            });
          }
        });

        // Audit log
        await logAction(req.user!.userId, "REMOVE_GROUP_MEMBER", "group", id, {
          userId,
          userEmail: member.user.email,
          groupName: member.group.name,
        });

        let message = `Вы были исключены из группы "${member.group.name}"`;
        
        if (member.group.courseId && member.group.course) {
          message += ` и потеряли доступ к курсу "${member.group.course.title}"`;
        }

        await createNotification(
          userId,
          "group_removal",
          "Исключение из группы",
          message,
          "/dashboard"
        );

        return NextResponse.json<ApiResponse>({ success: true }, { status: 200 });
      } catch (error) {
        console.error("Remove group member error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Не удалось удалить пользователя из группы",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin] }
  );
}


