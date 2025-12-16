import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { checkLessonAvailability } from "@/lib/lms-logic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (req) => {
    try {
      const { id } = await params;
        const lesson = await db.lesson.findUnique({
        where: { id },
        include: {
          module: {
            include: {
              course: {
                include: {
                  enrollments: {
                    where: {
                      userId: req.user!.userId,
                      status: "active",
                    },
                  },
                },
              },
            },
          },
          progress: {
            where: {
              userId: req.user!.userId,
            },
            take: 1,
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

      // Используем централизованную бизнес-логику для проверки доступа
      const availability = await checkLessonAvailability(req.user!.userId, id);

      if (!availability.isAvailable) {
        let message = "У вас нет доступа к этому уроку";
        if (availability.reason === "not_enrolled") {
          message = "Вы не зачислены на этот курс";
        } else if (availability.reason === "enrollment_not_active") {
          message = "Ваше зачисление неактивно";
        } else if (availability.reason === "enrollment_expired") {
          message = "Срок доступа к курсу истек";
        } else if (availability.reason === "drip_locked") {
          message = `Урок будет доступен ${availability.availableDate ? new Date(availability.availableDate).toLocaleDateString("ru-RU") : "позже"}`;
        } else if (availability.reason === "prerequisites_not_met") {
          message = "Сначала необходимо сдать домашнее задание к предыдущему уроку";
        }

        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "NO_ACCESS",
              message,
              details: {
                reason: availability.reason,
                availableDate: availability.availableDate,
                requiredLessonId: availability.requiredLessonId,
              },
            },
          },
          { status: 403 }
        );
      }

      const progress = lesson.progress[0] || null;

      return NextResponse.json<ApiResponse>(
        {
          success: true,
          data: {
            id: lesson.id,
            title: lesson.title,
            type: lesson.type,
            content: lesson.content,
            videoId: lesson.videoId,
            videoDuration: lesson.videoDuration,
            thumbnailUrl: lesson.thumbnailUrl,
            isFree: lesson.isFree,
            isStopLesson: lesson.isStopLesson,
            isAvailable: availability.isAvailable,
            availableDate: availability.availableDate,
            progress: progress
              ? {
                  status: progress.status,
                  watchedTime: progress.watchedTime,
                  rating: progress.rating,
                }
              : null,
          },
        },
        { status: 200 }
      );
    } catch (error) {
      console.error("Get lesson error:", error);
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Произошла ошибка при получении урока",
          },
        },
        { status: 500 }
      );
    }
  });
}

