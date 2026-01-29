import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { notifyHomeworkSubmitted } from "@/lib/notifications";
import { sanitizeText } from "@/lib/sanitize";
import { logAction } from "@/lib/audit";
import { z } from "zod";

const homeworkSubmitSchema = z.object({
  content: z.string().optional(),
  files: z.array(z.string()).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (req) => {
    try {
      const { id } = await params;
        const body = await request.json();
      const { content, files } = homeworkSubmitSchema.parse(body);

      if (!content && (!files || files.length === 0)) {
         return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Содержание задания обязательно или прикрепите файлы",
            },
          },
          { status: 400 }
        );
      }

      // Проверяем, что урок существует
      const lesson = await db.lesson.findUnique({
        where: { id },
        select: {
          id: true,
          title: true,
          moduleId: true,
          module: {
            select: {
              courseId: true,
              course: {
                select: {
                  id: true,
                  isPublished: true,
                },
              },
            },
          },
        },
      });

      if (!lesson) {
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Урок не найден",
            },
          },
          { status: 404 }
        );
      }

      // Проверяем доступ к курсу через бизнес-правила
      const { canUserAccessCourse } = await import("@/lib/business-rules");
      const accessCheck = await canUserAccessCourse(req.user!.userId, lesson.module.course.id);

      if (!accessCheck.canAccess) {
        let message = "У вас нет доступа к этому уроку";
        if (accessCheck.reason === "not_enrolled") {
          message = "Вы не зачислены на этот курс";
        } else if (accessCheck.reason === "enrollment_not_active") {
          message = "Ваше зачисление неактивно";
        } else if (accessCheck.reason === "enrollment_expired") {
          message = "Срок доступа к курсу истек";
        }

        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "NO_ACCESS",
              message,
            },
          },
          { status: 403 }
        );
      }

      // Проверяем возможность отправки ДЗ
      const { canUserSubmitHomework } = await import("@/lib/business-rules");
      const canSubmit = await canUserSubmitHomework(req.user!.userId, id);

      if (!canSubmit.canSubmit) {
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: canSubmit.reason === "already_approved" ? "ALREADY_APPROVED" : "ALREADY_SUBMITTED",
              message:
                canSubmit.reason === "already_approved"
                  ? "Ваше задание уже принято"
                  : "Вы уже отправили домашнее задание по этому уроку",
            },
          },
          { status: 400 }
        );
      }

      // Санитизируем контент перед сохранением
      // Санитизируем контент перед сохранением
      const sanitizedContent = content ? await sanitizeText(content) : "";

      // Проверяем существующую отправку
      const existingSubmission = await db.homeworkSubmission.findFirst({
        where: {
          userId: req.user!.userId,
          lessonId: id,
          status: { in: ["pending", "approved"] },
        },
      });

      let submission;
      if (existingSubmission) {
        // Если есть существующая отправка, обновляем её и создаем версию
        // Используем функцию из homework-history для версионности
        const { createHomeworkVersion } = await import("@/lib/homework-history");
        await createHomeworkVersion(
          existingSubmission.id,
          sanitizedContent,
          files || [],
          existingSubmission.status
        );

        // Обновляем отправку (новая версия)
        submission = await db.homeworkSubmission.update({
          where: { id: existingSubmission.id },
          data: {
            content: sanitizedContent,
            files: files || [],
            status: "pending", // Сбрасываем статус при новой версии
            curatorComment: null,
            curatorId: null,
            reviewedAt: null,
          },
          include: {
            user: true,
            lesson: {
              select: {
                id: true,
                title: true,
                isStopLesson: true,
              }
            },
          },
        });
      } else {
        // Создаем новую отправку
        submission = await db.homeworkSubmission.create({
          data: {
            userId: req.user!.userId,
            lessonId: id,
            content: sanitizedContent,
            files: files || [],
          },
          include: {
            user: true,
            lesson: {
              select: {
                id: true,
                title: true,
                isStopLesson: true,
              }
            },
          },
        });
      }

      // Если это не стоп-урок, помечаем его как пройденный сразу после отправки ДЗ
      if (!submission.lesson.isStopLesson) {
        await db.lessonProgress.upsert({
          where: {
            userId_lessonId: {
              userId: req.user!.userId,
              lessonId: id,
            },
          },
          update: {
            status: "completed",
            completedAt: new Date(),
            lastUpdated: new Date(),
          },
          create: {
            userId: req.user!.userId,
            lessonId: id,
            status: "completed",
            completedAt: new Date(),
            watchedTime: 0,
          },
        });
      }

      // Notify curators
      try {
        await notifyHomeworkSubmitted(
          submission.lesson.title,
          submission.user.fullName || submission.user.email,
          submission.id
        );
      } catch (notifyError) {
        console.error("Failed to notify curators about homework submission:", notifyError);
        // Don't fail the request if notification fails
      }

      // Log action
      await logAction(req.user!.userId, "SUBMIT_HOMEWORK", "homework", submission.id, {
         title: submission.lesson.title
      });

      return NextResponse.json<ApiResponse>(
        {
          success: true,
          data: submission,
        },
        { status: 201 }
      );
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: error.errors[0].message,
            },
          },
          { status: 400 }
        );
      }

      // Обработка ошибки race condition
      if (error instanceof Error && error.message === "ALREADY_SUBMITTED") {
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "ALREADY_SUBMITTED",
              message: "Вы уже отправили домашнее задание по этому уроку",
            },
          },
          { status: 400 }
        );
      }

      console.error("Submit homework error:", error);
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Произошла ошибка при отправке задания",
          },
        },
        { status: 500 }
      );
    }
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (req) => {
    try {
      const { id } = await params;
        const submission = await db.homeworkSubmission.findFirst({
        where: {
          userId: req.user!.userId,
          lessonId: id,
        },
        orderBy: { createdAt: "desc" },
      });

      if (!submission) {
        return NextResponse.json<ApiResponse>(
          {
            success: true,
            data: null,
          },
          { status: 200 }
        );
      }

      return NextResponse.json<ApiResponse>(
        {
          success: true,
          data: {
            id: submission.id,
            status: submission.status,
            content: submission.content,
            files: (submission.files as string[]) || [],
            curatorComment: submission.curatorComment,
            curatorAudioUrl: submission.curatorAudioUrl,
            curatorFiles: (submission.curatorFiles as string[]) || [], // Added curatorFiles
            createdAt: submission.createdAt.toISOString(),
            reviewedAt: submission.reviewedAt?.toISOString() || null,
          },
        },
        { status: 200 }
      );
    } catch (error) {
      console.error("Get homework submission error:", error);
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Произошла ошибка при получении задания",
          },
        },
        { status: 500 }
      );
    }
  });
}

