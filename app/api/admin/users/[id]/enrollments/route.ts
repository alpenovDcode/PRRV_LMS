import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";
import { adminEnrollmentSchema } from "@/lib/validations";
import { logAction } from "@/lib/audit";
import { sendTemplateEmail } from "@/lib/email-template-service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    request,
    async () => {
      try {
        const { id } = await params;
        const enrollments = await db.enrollment.findMany({
          where: { userId: id },
          include: {
            course: {
              select: {
                id: true,
                title: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        });

        return NextResponse.json<ApiResponse>({ success: true, data: enrollments }, { status: 200 });
      } catch (error) {
        console.error("Get user enrollments error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Не удалось получить зачисления пользователя",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin, UserRole.curator] }
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
        const { courseId, startDate, expiresAt } = adminEnrollmentSchema.parse(body);

        // Получаем информацию о курсе для уведомления
        const course = await db.course.findUnique({
          where: { id: courseId },
          select: { title: true, slug: true },
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

        // Проверяем, было ли уже зачисление
        const existingEnrollment = await db.enrollment.findUnique({
          where: {
            userId_courseId: {
              userId: id,
              courseId,
            },
          },
        });

        const isNewEnrollment = !existingEnrollment;

        const enrollment = await db.enrollment.upsert({
          where: {
            userId_courseId: {
              userId: id,
              courseId,
            },
          },
          update: {
            status: "active",
            startDate: startDate ? new Date(startDate) : new Date(),
            expiresAt: expiresAt ? new Date(expiresAt) : null,
          },
          create: {
            userId: id,
            courseId,
            status: "active",
            startDate: startDate ? new Date(startDate) : new Date(),
            expiresAt: expiresAt ? new Date(expiresAt) : null,
          },
        });

        // Создаем уведомление только для нового зачисления
        if (isNewEnrollment) {
          await db.notification.create({
            data: {
              userId: id,
              type: "enrollment",
              title: "Вы зачислены на курс",
              message: `Вы были зачислены на курс "${course.title}". Начните обучение прямо сейчас!`,
              link: `/courses/${course.slug}`,
              isRead: false,
            },
          });

          // Send email notification
          const user = await db.user.findUnique({
            where: { id },
            select: { email: true, fullName: true },
          });

          if (user) {
            await sendTemplateEmail("COURSE_ACCESS_GRANTED", user.email, {
              fullName: user.fullName || "Студент",
              courseName: course.title,
              courseUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://prrv.tech"}/courses/${course.slug}`,
            });
          }
        }

        // Audit log
        await logAction(
          req.user!.userId,
          isNewEnrollment ? "CREATE_ENROLLMENT" : "UPDATE_ENROLLMENT",
          "enrollment",
          enrollment.id,
          {
            userId: id,
            courseId,
            courseTitle: course.title,
          }
        );

        return NextResponse.json<ApiResponse>(
          {
            success: true,
            data: {
              ...enrollment,
              course: {
                id: courseId,
                title: course.title,
              },
            },
          },
          { status: 201 }
        );
      } catch (error) {
        console.error("Create enrollment error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Не удалось создать/обновить зачисление",
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
        const { searchParams } = new URL(request.url);
        const courseId = searchParams.get("courseId");

        if (!courseId) {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: {
                code: "VALIDATION_ERROR",
                message: "courseId обязателен для удаления зачисления",
              },
            },
            { status: 400 }
          );
        }

        // Получаем информацию о зачислении перед удалением для audit log
        const enrollment = await db.enrollment.findUnique({
          where: {
            userId_courseId: {
              userId: id,
              courseId,
            },
          },
          include: {
            course: {
              select: { title: true },
            },
          },
        });

        await db.enrollment.delete({
          where: {
            userId_courseId: {
              userId: id,
              courseId,
            },
          },
        });

        // Audit log
        if (enrollment) {
          await logAction(req.user!.userId, "DELETE_ENROLLMENT", "enrollment", enrollment.id, {
            userId: id,
            courseId,
            courseTitle: enrollment.course.title,
          });
        }

        return NextResponse.json<ApiResponse>({ success: true }, { status: 200 });
      } catch (error) {
        console.error("Delete enrollment error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Не удалось удалить зачисление",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}


