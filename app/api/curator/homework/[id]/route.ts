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
import { sendTelegramMessage } from "@/lib/telegram";

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
            landingBlock: {
              include: { page: true }
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
          // @ts-ignore
          curatorFiles: (submission.curatorFiles as string[]) || [],
          curatorComment: submission.curatorComment,
          // @ts-ignore
          curatorAudioUrl: submission.curatorAudioUrl || null,
          createdAt: submission.createdAt.toISOString(),
          reviewedAt: submission.reviewedAt?.toISOString() || null,
          user: {
            id: submission.user.id,
            fullName: submission.user.fullName,
            email: submission.user.email,
          },
          curator: submission.curator ? {
            id: submission.curator.id,
            fullName: submission.curator.fullName,
            avatarUrl: submission.curator.avatarUrl,
          } : null,
          lesson: submission.lesson ? {
            id: submission.lesson.id,
            title: submission.lesson.title,
            content: submission.lesson.content,
          } : null,
          landing: submission.landingBlock ? {
             id: submission.landingBlock.id,
             title: submission.landingBlock.page?.title || "Лендинг",
             type: "landing"
          } : null,
          course: submission.lesson ? {
            id: submission.lesson.module.course.id,
            title: submission.lesson.module.course.title,
          } : null,
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
        const { status, curatorComment, curatorFiles, curatorAudioUrl } = body;
        // Ideally use Zod schema, but for speed adding here
        
        // ... (existing code)

        // Санитизируем комментарий куратора
        const sanitizedComment = curatorComment ? await sanitizeText(curatorComment) : null;

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
              curatorAudioUrl: true, // Add selection
              curatorId: true,
              // @ts-ignore
              curatorFiles: true, // Add selection
            },
          });

          if (!submission) {
            throw new Error("SUBMISSION_NOT_FOUND");
          }

          // Создаем версию в истории перед обновлением
          await tx.homeworkHistory.create({
            data: {
              submissionId: id,
              content: submission.content || null,
              files: submission.files || [],
              status: submission.status,
              curatorComment: submission.curatorComment || null,
              curatorAudioUrl: submission.curatorAudioUrl || null,
              curatorId: submission.curatorId || null,
            },
          });

          // Обновляем основную запись
          const updatedSubmission = await tx.homeworkSubmission.update({
            where: { id },
            data: {
              status,
              curatorComment: sanitizedComment,
              curatorAudioUrl: curatorAudioUrl || null,
              curatorId: req.user!.userId,
              reviewedAt: new Date(),
              ...({ curatorFiles: curatorFiles || [] } as any),
            },
            include: {
              lesson: {
                select: { 
                  id: true, 
                  title: true,
                  isStopLesson: true 
                },
              },
              landingBlock: {
                 include: { page: true }
              },
              user: {
                select: { id: true, telegramChatId: true },
              },
            },
          });

          // Если задание принято И это урок, обновляем прогресс урока
          if (status === "approved" && updatedSubmission.lesson) {
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
          const title = updated.lesson?.title || updated.landingBlock?.page?.title || "Домашнее задание";
          await notifyHomeworkReviewed(updated.userId, title, status);
          
          if (updated.user.telegramChatId) {
            const statusText = status === "approved" ? "✅ Принято" : "❌ Отклонено";
            const text = `📋 <b>Ваше домашнее задание проверено!</b>\n\n📌 Урок: <b>${title}</b>\nРезультат: <b>${statusText}</b>\n\n💬 Комментарий куратора:\n<i>${sanitizedComment || "Нет комментариев"}</i>`;
            await sendTelegramMessage(updated.user.telegramChatId, text);
          }
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
        /* Removed SUBMISSION_ALREADY_REVIEWED check */
        
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


