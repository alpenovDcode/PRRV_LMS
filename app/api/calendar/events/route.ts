import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { ApiResponse } from "@/types";
import { db } from "@/lib/db";
import { DripRule } from "@/lib/lms-logic";
import { addDays, startOfDay, isAfter, isBefore } from "date-fns";

export type CalendarEventType =
  | "lesson_available"
  | "homework_deadline"
  | "homework_soft_deadline"
  | "quiz_deadline"
  | "completed"
  | "live_webinar"
  | "qa_session";

export interface CalendarEvent {
  id: string;
  type: CalendarEventType;
  title: string;
  description?: string;
  date: string; // ISO date string
  time?: string; // HH:mm format
  courseId: string;
  courseTitle: string;
  lessonId?: string;
  lessonTitle?: string;
  isCompleted?: boolean;
  isLate?: boolean;
  color: "pink" | "blue" | "green" | "purple";
}

/**
 * GET /api/calendar/events
 * Получить календарные события для студента
 */
export async function GET(request: NextRequest) {
  return withAuth(request, async (req) => {
    try {
      const { searchParams } = new URL(request.url);
      const startDate = searchParams.get("startDate"); // YYYY-MM-DD
      const endDate = searchParams.get("endDate"); // YYYY-MM-DD

      const start = startDate ? new Date(startDate) : startOfDay(new Date());
      const end = endDate
        ? new Date(endDate)
        : addDays(startOfDay(new Date()), 60); // По умолчанию 60 дней вперед

      const events: CalendarEvent[] = [];

      // Получаем все активные enrollments пользователя
      const enrollments = await db.enrollment.findMany({
        where: {
          userId: req.user!.userId,
          status: "active",
        },
        include: {
          course: {
            include: {
              modules: {
                include: {
                  lessons: {
                    include: {
                      progress: {
                        where: {
                          userId: req.user!.userId,
                        },
                        take: 1,
                      },
                      homework: {
                        where: {
                          userId: req.user!.userId,
                          status: { in: ["pending", "approved"] },
                        },
                        orderBy: {
                          createdAt: "desc",
                        },
                        take: 1,
                      },
                    },
                    orderBy: {
                      orderIndex: "asc",
                    },
                  },
                },
                orderBy: {
                  orderIndex: "asc",
                },
              },
            },
          },
        },
      });

      for (const enrollment of enrollments) {
        const course = enrollment.course;

        for (const courseModule of course.modules) {
          for (const lesson of courseModule.lessons) {
            // 1. События открытия уроков (drip content)
            if (lesson.dripRule) {
              const dripRule = lesson.dripRule as unknown as DripRule;
              let availableDate: Date | null = null;

              if (dripRule.type === "after_start" && dripRule.days !== undefined) {
                availableDate = addDays(startOfDay(enrollment.startDate), dripRule.days);
              } else if (dripRule.type === "on_date" && dripRule.date) {
                availableDate = startOfDay(new Date(dripRule.date));
              }

              if (availableDate && isAfter(availableDate, start) && isBefore(availableDate, end)) {
                const isCompleted = lesson.progress[0]?.status === "completed";

                events.push({
                  id: `lesson-${lesson.id}`,
                  type: isCompleted ? "completed" : "lesson_available",
                  title: lesson.title,
                  description: `Модуль: ${courseModule.title}`,
                  date: availableDate.toISOString().split("T")[0],
                  courseId: course.id,
                  courseTitle: course.title,
                  lessonId: lesson.id,
                  lessonTitle: lesson.title,
                  isCompleted,
                  color: isCompleted ? "green" : "blue",
                });
              }
            }

            // 2. Дедлайны домашних заданий (из enhanced drip rule или settings)
            if (lesson.type !== "quiz") {
              // Проверяем enhanced drip rule
              const enhancedDripRule = lesson.dripRule as unknown as {
                softDeadline?: string;
                hardDeadline?: string;
                type?: string;
                days?: number;
                date?: string;
              } | null;

              // Также проверяем settings для дедлайнов
              const lessonSettings = lesson.settings as {
                homeworkDeadline?: string;
                homeworkSoftDeadline?: string;
              } | null;

              const softDeadlineStr = enhancedDripRule?.softDeadline || lessonSettings?.homeworkSoftDeadline;
              const hardDeadlineStr = enhancedDripRule?.hardDeadline || lessonSettings?.homeworkDeadline;

              // Soft deadline
              if (softDeadlineStr) {
                try {
                  const softDeadline = startOfDay(new Date(softDeadlineStr));
                  if (isAfter(softDeadline, start) && isBefore(softDeadline, end)) {
                    const homework = lesson.homework[0];
                    const isCompleted = homework?.status === "approved";
                    const isLate = isAfter(new Date(), softDeadline) && !isCompleted;

                    events.push({
                      id: `homework-soft-${lesson.id}`,
                      type: isCompleted ? "completed" : isLate ? "homework_soft_deadline" : "homework_deadline",
                      title: `Сдача домашнего задания: ${lesson.title}`,
                      description: course.title,
                      date: softDeadline.toISOString().split("T")[0],
                      time: "23:59",
                      courseId: course.id,
                      courseTitle: course.title,
                      lessonId: lesson.id,
                      lessonTitle: lesson.title,
                      isCompleted,
                      isLate,
                      color: isCompleted ? "green" : "pink",
                    });
                  }
                } catch (e) {
                  // Игнорируем невалидные даты
                }
              }

              // Hard deadline
              if (hardDeadlineStr) {
                try {
                  const hardDeadline = startOfDay(new Date(hardDeadlineStr));
                  if (isAfter(hardDeadline, start) && isBefore(hardDeadline, end)) {
                    const homework = lesson.homework[0];
                    const isCompleted = homework?.status === "approved";

                    events.push({
                      id: `homework-hard-${lesson.id}`,
                      type: isCompleted ? "completed" : "homework_deadline",
                      title: `Дедлайн: ${lesson.title}`,
                      description: course.title,
                      date: hardDeadline.toISOString().split("T")[0],
                      time: "23:59",
                      courseId: course.id,
                      courseTitle: course.title,
                      lessonId: lesson.id,
                      lessonTitle: lesson.title,
                      isCompleted,
                      color: isCompleted ? "green" : "pink",
                    });
                  }
                } catch (e) {
                  // Игнорируем невалидные даты
                }
              }
            }

            // 3. Дедлайны квизов
            if (lesson.type === "quiz") {
              const enhancedDripRule = lesson.dripRule as unknown as {
                hardDeadline?: string;
              } | null;

              const lessonSettings = lesson.settings as {
                quizDeadline?: string;
              } | null;

              const quizDeadlineStr = enhancedDripRule?.hardDeadline || lessonSettings?.quizDeadline;

              if (quizDeadlineStr) {
                try {
                  const quizDeadline = startOfDay(new Date(quizDeadlineStr));
                  if (isAfter(quizDeadline, start) && isBefore(quizDeadline, end)) {
                    const attempts = await db.quizAttempt.findMany({
                      where: {
                        userId: req.user!.userId,
                        lessonId: lesson.id,
                        isPassed: true,
                      },
                    });

                    const isCompleted = attempts.length > 0;

                    events.push({
                      id: `quiz-${lesson.id}`,
                      type: isCompleted ? "completed" : "quiz_deadline",
                      title: `Тест: ${lesson.title}`,
                      description: course.title,
                      date: quizDeadline.toISOString().split("T")[0],
                      time: "23:59",
                      courseId: course.id,
                      courseTitle: course.title,
                      lessonId: lesson.id,
                      lessonTitle: lesson.title,
                      isCompleted,
                      color: isCompleted ? "green" : "pink",
                    });
                  }
                } catch (e) {
                  // Игнорируем невалидные даты
                }
              }
            }
          }
        }
      }

      // Сортируем события по дате
      events.sort((a, b) => {
        const dateA = new Date(a.date + (a.time ? `T${a.time}` : "T00:00"));
        const dateB = new Date(b.date + (b.time ? `T${b.time}` : "T00:00"));
        return dateA.getTime() - dateB.getTime();
      });

      return NextResponse.json<ApiResponse>(
        {
          success: true,
          data: events,
        },
        { status: 200 }
      );
    } catch (error) {
      console.error("Get calendar events error:", error);
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Произошла ошибка при получении календарных событий",
          },
        },
        { status: 500 }
      );
    }
  });
}

