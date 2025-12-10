import { db } from "@/lib/db";
import { isAfter } from "date-fns";
import { checkEnhancedDripAvailability, calculateEnhancedDripAvailability, EnhancedDripRule } from "./drip-content-enhanced";

export interface DripRule {
  type: "after_start" | "on_date";
  days?: number;
  date?: string;
}

export interface LessonAvailabilityResult {
  isAvailable: boolean;
  reason?: "not_enrolled" | "enrollment_not_active" | "enrollment_expired" | "drip_locked" | "prerequisites_not_met" | "hard_deadline_passed";
  availableDate?: string;
  requiredLessonId?: string;
}

export async function checkLessonAvailability(userId: string, lessonId: string): Promise<LessonAvailabilityResult> {
  // ... (keep existing enrollment checks) ...
  // Note: I need to re-implement the function body properly because previous replace was partial/broken
  
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

  if (enrollment.status !== "active") {
    return { isAvailable: false, reason: "enrollment_not_active" };
  }

  if (enrollment.expiresAt && isAfter(new Date(), enrollment.expiresAt)) {
    return { isAvailable: false, reason: "enrollment_expired" };
  }

  // Use enhanced drip check
  try {
    const dripResult = await checkEnhancedDripAvailability(userId, lessonId);
    if (!dripResult.isAvailable) {
      return {
        isAvailable: false,
        reason: dripResult.reason,
        availableDate: dripResult.availableDate,
      };
    }
  } catch (error) {
    console.error("Drip check failed:", error);
  }

  // Проверка prerequisites (стоп-уроки)
  const previousLesson = await db.lesson.findFirst({
    where: {
      moduleId: lesson.moduleId,
      orderIndex: {
        lt: lesson.orderIndex,
      },
    },
    orderBy: {
      orderIndex: "desc",
    },
    select: {
      id: true,
      isStopLesson: true,
    },
  });

  if (previousLesson?.isStopLesson) {
    const submission = await db.homeworkSubmission.findFirst({
      where: {
        userId,
        lessonId: previousLesson.id,
        status: "approved",
      },
    });

    if (!submission) {
      return {
        isAvailable: false,
        reason: "prerequisites_not_met",
        requiredLessonId: previousLesson.id,
      };
    }
  }

  return { isAvailable: true };
}

// ...

/**
 * Проверяет prerequisites для урока (стоп-уроки)
 */
export async function checkPrerequisites(userId: string, lessonId: string): Promise<{
  isUnlocked: boolean;
  reason?: string;
  requiredLessonId?: string;
}> {
  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    select: {
      id: true,
      orderIndex: true,
      moduleId: true,
      isStopLesson: true,
    },
  });

  if (!lesson) {
    throw new Error("Lesson not found");
  }

  // Find previous lesson in the same module
  const previousLesson = await db.lesson.findFirst({
    where: {
      moduleId: lesson.moduleId,
      orderIndex: {
        lt: lesson.orderIndex,
      },
    },
    orderBy: {
      orderIndex: "desc",
    },
  });

  if (!previousLesson) {
    return { isUnlocked: true };
  }

  if (previousLesson.isStopLesson) {
    // Check if homework is approved for previous lesson
    const submission = await db.homeworkSubmission.findFirst({
      where: {
        userId,
        lessonId: previousLesson.id,
        status: "approved",
      },
    });

    if (!submission) {
      return { 
        isUnlocked: false,
        reason: "previous_homework_required",
        requiredLessonId: previousLesson.id 
      };
    }
  }

  return { isUnlocked: true };
}

export function calculateDripAvailability(
  dripRule: DripRule | null | undefined,
  enrollmentStartDate: Date,
  previousLessonCompletedAt?: Date | null
): { isAvailable: boolean; availableDate?: Date } {
  const enhancedRule = dripRule as unknown as EnhancedDripRule | null;
  const result = calculateEnhancedDripAvailability(enhancedRule, enrollmentStartDate, previousLessonCompletedAt);
  
  return {
    isAvailable: result.isAvailable,
    availableDate: result.availableDate ? new Date(result.availableDate) : undefined,
  };
}
