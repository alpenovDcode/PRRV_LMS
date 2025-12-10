import { addDays, addHours, isAfter, startOfDay } from "date-fns";
import { db } from "./db";

/**
 * Улучшенная логика Drip Content с поддержкой:
 * - Soft/Hard deadlines
 * - after_previous_completed
 */

export interface EnhancedDripRule {
  type: "after_start" | "on_date" | "after_previous_completed";
  days?: number;
  date?: string;
  softDeadline?: string; // Мягкий дедлайн (можно сдать с пометкой "Late")
  hardDeadline?: string; // Жесткий дедлайн (блокировка отправки)
  delayHours?: number; // Для after_previous_completed
}

export interface DripAvailabilityResult {
  isAvailable: boolean;
  reason?: "not_enrolled" | "drip_locked" | "hard_deadline_passed";
  availableDate?: string;
  softDeadline?: string;
  hardDeadline?: string;
  isLate?: boolean; // Просрочен soft deadline
}

/**
 * Проверяет доступность урока с учетом улучшенных drip правил
 */
/**
 * Вычисляет доступность на основе правил и данных (Pure function)
 */
export function calculateEnhancedDripAvailability(
  dripRule: EnhancedDripRule | null,
  enrollmentStartDate: Date,
  previousLessonCompletedAt?: Date | null
): DripAvailabilityResult {
  if (!dripRule) {
    return { isAvailable: true };
  }

  const now = new Date();

  // Проверка hard deadline
  if (dripRule.hardDeadline) {
    const hardDeadline = startOfDay(new Date(dripRule.hardDeadline));
    if (isAfter(now, hardDeadline)) {
      return {
        isAvailable: false,
        reason: "hard_deadline_passed",
        hardDeadline: hardDeadline.toISOString(),
      };
    }
  }

  // Проверка soft deadline
  let isLate = false;
  if (dripRule.softDeadline) {
    const softDeadline = startOfDay(new Date(dripRule.softDeadline));
    if (isAfter(now, softDeadline)) {
      isLate = true;
    }
  }

  // Проверка типа drip rule
  if (dripRule.type === "after_start" && dripRule.days !== undefined) {
    const availableDate = addDays(startOfDay(enrollmentStartDate), dripRule.days);
    if (isAfter(availableDate, now)) {
      return {
        isAvailable: false,
        reason: "drip_locked",
        availableDate: availableDate.toISOString(),
        softDeadline: dripRule.softDeadline,
        hardDeadline: dripRule.hardDeadline,
      };
    }
  } else if (dripRule.type === "on_date" && dripRule.date) {
    const availableDate = startOfDay(new Date(dripRule.date));
    if (isAfter(availableDate, now)) {
      return {
        isAvailable: false,
        reason: "drip_locked",
        availableDate: availableDate.toISOString(),
        softDeadline: dripRule.softDeadline,
        hardDeadline: dripRule.hardDeadline,
      };
    }
  } else if (dripRule.type === "after_previous_completed") {
    if (!previousLessonCompletedAt) {
      return {
        isAvailable: false,
        reason: "drip_locked",
        softDeadline: dripRule.softDeadline,
        hardDeadline: dripRule.hardDeadline,
      };
    }

    const delayHours = dripRule.delayHours || 0;
    const availableDate = addHours(previousLessonCompletedAt, delayHours);
    
    if (isAfter(availableDate, now)) {
      return {
        isAvailable: false,
        reason: "drip_locked",
        availableDate: availableDate.toISOString(),
        softDeadline: dripRule.softDeadline,
        hardDeadline: dripRule.hardDeadline,
      };
    }
  }

  return {
    isAvailable: true,
    softDeadline: dripRule.softDeadline,
    hardDeadline: dripRule.hardDeadline,
    isLate,
  };
}

/**
 * Проверяет доступность урока с учетом улучшенных drip правил (Async wrapper)
 */
export async function checkEnhancedDripAvailability(
  userId: string,
  lessonId: string
): Promise<DripAvailabilityResult> {
  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    include: {
      module: {
        include: {
          course: {
            include: {
              enrollments: {
                where: { userId },
              },
            },
          },
        },
      },
    },
  });

  if (!lesson) {
    throw new Error("Lesson not found");
  }

  const enrollment = lesson.module.course.enrollments[0];
  if (!enrollment) {
    return { isAvailable: false, reason: "not_enrolled" };
  }

  const dripRule = lesson.dripRule as unknown as EnhancedDripRule | null;
  
  let previousLessonCompletedAt: Date | undefined;

  if (dripRule?.type === "after_previous_completed") {
    // Находим предыдущий урок
    let previousLesson = await db.lesson.findFirst({
      where: {
        moduleId: lesson.moduleId,
        orderIndex: {
          lt: lesson.orderIndex,
        },
      },
      orderBy: {
        orderIndex: "desc",
      },
      include: {
        progress: {
          where: {
            userId,
            status: "completed",
          },
        },
      },
    });

    // Если в текущем модуле нет предыдущего урока, ищем в предыдущем модуле
    if (!previousLesson) {
      const currentModule = await db.module.findUnique({
        where: { id: lesson.moduleId },
        select: { courseId: true, orderIndex: true },
      });

      if (currentModule) {
        const previousModule = await db.module.findFirst({
          where: {
            courseId: currentModule.courseId,
            orderIndex: {
              lt: currentModule.orderIndex,
            },
          },
          orderBy: {
            orderIndex: "desc",
          },
          include: {
            lessons: {
              orderBy: {
                orderIndex: "desc",
              },
              take: 1,
              include: {
                progress: {
                  where: {
                    userId,
                    status: "completed",
                  },
                },
              },
            },
          },
        });

        if (previousModule && previousModule.lessons.length > 0) {
          previousLesson = previousModule.lessons[0];
        }
      }
    }

    console.log(`[DRIP CHECK] Lesson ${lessonId} (${lesson.title}) depends on previous. Found previous: ${previousLesson?.id} (${previousLesson?.title}). Completed: ${previousLesson?.progress.length ? "YES" : "NO"}`);

    if (previousLesson && previousLesson.progress.length > 0) {
      previousLessonCompletedAt = previousLesson.progress[0].completedAt || undefined;
    }
  }

  return calculateEnhancedDripAvailability(
    dripRule,
    enrollment.startDate,
    previousLessonCompletedAt
  );
}

/**
 * Проверяет, можно ли отправить домашнее задание с учетом deadlines
 */
export function canSubmitHomework(
  dripResult: DripAvailabilityResult
): {
  canSubmit: boolean;
  reason?: string;
  isLate?: boolean;
} {
  if (!dripResult.isAvailable) {
    return {
      canSubmit: false,
      reason: dripResult.reason === "hard_deadline_passed" 
        ? "hard_deadline_passed" 
        : "lesson_not_available",
    };
  }

  if (dripResult.hardDeadline) {
    const hardDeadline = new Date(dripResult.hardDeadline);
    if (isAfter(new Date(), hardDeadline)) {
      return {
        canSubmit: false,
        reason: "hard_deadline_passed",
      };
    }
  }

  return {
    canSubmit: true,
    isLate: dripResult.isLate,
  };
}

