import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";
import { adminEnrollmentSchema } from "@/lib/validations";
import { logAction } from "@/lib/audit";
import { validateEnrollmentCreation } from "@/lib/business-rules";

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
        const { courseId, startDate, expiresAt } = adminEnrollmentSchema.parse(body);

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

        // Валидация бизнес-правил
        const startDateObj = startDate ? new Date(startDate) : new Date();
        const expiresAtObj = expiresAt ? new Date(expiresAt) : null;

        // Проверяем валидность для первого пользователя (для примера)
        const members = await db.groupMember.findMany({
          where: { groupId: id },
          take: 1,
        });

        if (members.length > 0) {
          const validation = await validateEnrollmentCreation(
            members[0].userId,
            courseId,
            startDateObj,
            expiresAtObj
          );

          if (!validation.isValid) {
            return NextResponse.json<ApiResponse>(
              {
                success: false,
                error: {
                  code: "VALIDATION_ERROR",
                  message: validation.errors.join(", "),
                },
              },
              { status: 400 }
            );
          }
        }

        // Получаем всех участников группы
        const allMembers = await db.groupMember.findMany({
          where: { groupId: id },
        });

        if (allMembers.length === 0) {
          return NextResponse.json<ApiResponse>(
            {
              success: true,
              data: { affected: 0, message: "В группе нет участников" },
            },
            { status: 200 }
          );
        }

        // Получаем информацию о курсе
        const course = await db.course.findUnique({
          where: { id: courseId },
          select: { id: true, title: true, slug: true, isPublished: true },
        });

        if (!course) {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: {
                code: "NOT_FOUND",
                message: "Курс не найден",
              },
            },
            { status: 404 }
          );
        }

        // Используем транзакцию для атомарной операции
        const result = await db.$transaction(async (tx) => {
          // Получаем существующие зачисления
          const existingEnrollments = await tx.enrollment.findMany({
            where: {
              userId: { in: allMembers.map((m) => m.userId) },
              courseId,
            },
            select: { userId: true },
          });

          const existingUserIds = new Set(existingEnrollments.map((e) => e.userId));

          // Создаем/обновляем зачисления
          const enrollments = await Promise.all(
            allMembers.map((member) =>
              tx.enrollment.upsert({
                where: {
                  userId_courseId: {
                    userId: member.userId,
                    courseId,
                  },
                },
                update: {
                  status: "active",
                  startDate: startDateObj,
                  expiresAt: expiresAtObj,
                },
                create: {
                  userId: member.userId,
                  courseId,
                  status: "active",
                  startDate: startDateObj,
                  expiresAt: expiresAtObj,
                },
              })
            )
          );

          // Создаем уведомления только для новых зачислений
          const newMembers = allMembers.filter((m) => !existingUserIds.has(m.userId));
          if (newMembers.length > 0) {
            await tx.notification.createMany({
              data: newMembers.map((member) => ({
                userId: member.userId,
                type: "enrollment",
                title: "Вы зачислены на курс",
                message: `Вы были зачислены на курс "${course.title}". Начните обучение прямо сейчас!`,
                link: `/courses/${course.slug}`,
                isRead: false,
              })),
            });
          }

          return {
            total: enrollments.length,
            new: newMembers.length,
            updated: existingEnrollments.length,
          };
        });

        // Audit log
        await logAction(req.user!.userId, "BULK_ENROLL_GROUP", "group", id, {
          groupName: group.name,
          courseId,
          courseTitle: course.title,
          affected: result.total,
          new: result.new,
        });

        return NextResponse.json<ApiResponse>(
          {
            success: true,
            data: {
              affected: result.total,
              new: result.new,
              updated: result.updated,
            },
          },
          { status: 200 }
        );
      } catch (error) {
        console.error("Bulk group enroll error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Не удалось выдать курс группе",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}


