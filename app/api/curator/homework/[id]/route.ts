import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";
import { curatorHomeworkReviewSchema } from "@/lib/validations";
import { notifyHomeworkReviewed } from "@/lib/notifications";
import { sanitizeText } from "@/lib/sanitize";
import { canCuratorReviewHomework } from "@/lib/business-rules";
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
        const submission = await db.homeworkSubmission.findUnique({
          where: { id },
          include: {
            user: true,
            lesson: {
              include: {
                module: {
                  include: {
                    course: true,
                  },
                },
              },
            },
            curator: true,
          },
        });

        if (!submission) {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: {
                code: "NOT_FOUND",
                message: "Отправка не найдена",
              },
            },
            { status: 404 }
          );
        }

        const data = {
          id: submission.id,
          status: submission.status,
          content: submission.content,
          files: (submission.files as string[]) || [],
          curatorComment: submission.curatorComment,
          createdAt: submission.createdAt.toISOString(),
          reviewedAt: submission.reviewedAt?.toISOString() || null,
          user: {
            id: submission.user.id,
            fullName: submission.user.fullName,
            email: submission.user.email,
          },
          lesson: {
            id: submission.lesson.id,
            title: submission.lesson.title,
            content: submission.lesson.content,
          },
          course: {
            id: submission.lesson.module.course.id,
            title: submission.lesson.module.course.title,
          },
        };

        return NextResponse.json<ApiResponse>({ success: true, data }, { status: 200 });
      } catch (error) {
        console.error("Get homework submission error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Не удалось получить отправку",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.curator, UserRole.admin] }
  );
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    request,
    async (req) => {
      try {
        const { id } = await params;
        const body = await request.json();
        const { status, curatorComment } = curatorHomeworkReviewSchema.parse(body);

        // Проверяем права куратора на проверку этого задания
        const canReview = await canCuratorReviewHomework(req.user!.userId, id);

        if (!canReview.canReview) {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: {
                code: "FORBIDDEN",
                message: canReview.reason === "submission_not_found"
                  ? "Задание не найдено"
                  : canReview.reason === "submission_approved" || canReview.reason === "submission_rejected"
                  ? "Задание уже проверено"
                  : "Нет прав на проверку этого задания",
              },
            },
            { status: 403 }
          );
        }

        // Санитизируем комментарий куратора
        const sanitizedComment = curatorComment ? await sanitizeText(curatorComment) : null;

        // Используем версионность через updateHomeworkWithHistory
        // const { updateHomeworkWithHistory } = await import("@/lib/homework-history");

        // Используем транзакцию для атомарного обновления
        const updated = await db.$transaction(async (tx) => {
          // Повторная проверка статуса внутри транзакции (защита от race condition)
          const submission = await tx.homeworkSubmission.findUnique({
            where: { id },
            select: {
              status: true,
              content: true,
              files: true,
              curatorComment: true,
              curatorId: true,
            },
          });

          if (!submission || submission.status !== "pending") {
            throw new Error("SUBMISSION_ALREADY_REVIEWED");
          }

          // Создаем версию в истории перед обновлением
          await tx.homeworkHistory.create({
            data: {
              submissionId: id,
              content: submission.content || null,
              files: submission.files || [],
              status: submission.status,
              curatorComment: submission.curatorComment || null,
              curatorId: submission.curatorId || null,
            },
          });

          // Обновляем основную запись
          const updatedSubmission = await tx.homeworkSubmission.update({
            where: { id },
            data: {
              status,
              curatorComment: sanitizedComment,
              curatorId: req.user!.userId,
              reviewedAt: new Date(),
            },
            include: {
              lesson: {
                select: { 
                  id: true, 
                  title: true,
                  isStopLesson: true 
                },
              },
              user: {
                select: { id: true },
              },
            },
          });

          // Если задание принято, обновляем прогресс урока до completed
          if (status === "approved") {
            await tx.lessonProgress.upsert({
              where: {
                userId_lessonId: {
                  userId: updatedSubmission.userId,
                  lessonId: updatedSubmission.lesson.id,
                },
              },
              update: {
                status: "completed",
                completedAt: new Date(),
                lastUpdated: new Date(),
              },
              create: {
                userId: updatedSubmission.userId,
                lessonId: updatedSubmission.lesson.id,
                status: "completed",
                completedAt: new Date(),
                watchedTime: 0,
              },
            });
          }

          return updatedSubmission;
        });

        // Notify student
        if (status === "approved" || status === "rejected") {
          await notifyHomeworkReviewed(updated.userId, updated.lesson.title, status);
        }

        // Audit log
        await logAction(req.user!.userId, "REVIEW_HOMEWORK", "homework", id, {
          status,
          studentId: updated.userId,
        });

        return NextResponse.json<ApiResponse>(
          {
            success: true,
            data: {
              id: updated.id,
              status: updated.status,
            },
          },
          { status: 200 }
        );
      } catch (error) {
        if (error instanceof Error && error.message === "SUBMISSION_ALREADY_REVIEWED") {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: {
                code: "ALREADY_REVIEWED",
                message: "Задание уже проверено другим куратором",
              },
            },
            { status: 409 }
          );
        }

        console.error("Update homework submission error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Не удалось обновить отправку",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.curator, UserRole.admin] }
  );
}


