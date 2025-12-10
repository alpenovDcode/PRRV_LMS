import { db } from "@/lib/db";
import { EnrollmentStatus } from "@prisma/client";

/**
 * Бизнес-правила для LMS системы
 */

/**
 * Проверяет, может ли пользователь получить доступ к курсу
 */
export async function canUserAccessCourse(userId: string, courseId: string): Promise<{
  canAccess: boolean;
  reason?: string;
  enrollment?: {
    id: string;
    status: EnrollmentStatus;
    startDate: Date;
    expiresAt: Date | null;
  };
}> {
  const enrollment = await db.enrollment.findUnique({
    where: {
      userId_courseId: {
        userId,
        courseId,
      },
    },
  });

  if (!enrollment) {
    return { canAccess: false, reason: "not_enrolled" };
  }

  if (enrollment.status !== "active") {
    return {
      canAccess: false,
      reason: `enrollment_${enrollment.status}`,
      enrollment: {
        id: enrollment.id,
        status: enrollment.status,
        startDate: enrollment.startDate,
        expiresAt: enrollment.expiresAt,
      },
    };
  }

  if (enrollment.expiresAt && enrollment.expiresAt < new Date()) {
    return {
      canAccess: false,
      reason: "enrollment_expired",
      enrollment: {
        id: enrollment.id,
        status: enrollment.status,
        startDate: enrollment.startDate,
        expiresAt: enrollment.expiresAt,
      },
    };
  }

  return {
    canAccess: true,
    enrollment: {
      id: enrollment.id,
      status: enrollment.status,
      startDate: enrollment.startDate,
      expiresAt: enrollment.expiresAt,
    },
  };
}

/**
 * Проверяет, может ли пользователь отправить домашнее задание
 */
export async function canUserSubmitHomework(
  userId: string,
  lessonId: string
): Promise<{
  canSubmit: boolean;
  reason?: string;
  existingSubmissionId?: string;
}> {
  // Проверяем наличие активной отправки
  const existingSubmission = await db.homeworkSubmission.findFirst({
    where: {
      userId,
      lessonId,
      status: { in: ["pending", "approved"] },
    },
    select: { id: true, status: true },
  });

  if (existingSubmission) {
    return {
      canSubmit: false,
      reason: existingSubmission.status === "approved" ? "already_approved" : "already_submitted",
      existingSubmissionId: existingSubmission.id,
    };
  }

  return { canSubmit: true };
}

/**
 * Проверяет, может ли куратор проверить домашнее задание
 */
export async function canCuratorReviewHomework(
  curatorId: string,
  submissionId: string
): Promise<{
  canReview: boolean;
  reason?: string;
}> {
  const submission = await db.homeworkSubmission.findUnique({
    where: { id: submissionId },
    include: {
      lesson: {
        include: {
          module: {
            include: {
              course: true,
            },
          },
        },
      },
    },
  });

  if (!submission) {
    return { canReview: false, reason: "submission_not_found" };
  }

  if (submission.status !== "pending") {
    return { canReview: false, reason: `submission_${submission.status}` };
  }

  // Здесь можно добавить проверку, назначен ли куратор на этот курс
  // Пока разрешаем всем кураторам проверять любые задания

  return { canReview: true };
}

/**
 * Вычисляет прогресс пользователя по курсу
 */
export async function calculateCourseProgress(
  userId: string,
  courseId: string
): Promise<{
  progress: number; // 0-100
  completedLessons: number;
  totalLessons: number;
  lessons: Array<{
    lessonId: string;
    status: "not_started" | "in_progress" | "completed";
    watchedTime: number;
  }>;
}> {
  const course = await db.course.findUnique({
    where: { id: courseId },
    include: {
      modules: {
        include: {
          lessons: {
            select: { id: true },
            orderBy: { orderIndex: "asc" },
          },
        },
        orderBy: { orderIndex: "asc" },
      },
    },
  });

  if (!course) {
    throw new Error("Course not found");
  }

  const allLessons = course.modules.flatMap((m) => m.lessons);
  const totalLessons = allLessons.length;

  if (totalLessons === 0) {
    return {
      progress: 0,
      completedLessons: 0,
      totalLessons: 0,
      lessons: [],
    };
  }

  const progressRecords = await db.lessonProgress.findMany({
    where: {
      userId,
      lessonId: { in: allLessons.map((l) => l.id) },
    },
  });

  const progressMap = new Map(
    progressRecords.map((p) => [p.lessonId, { status: p.status, watchedTime: p.watchedTime }])
  );

  const completedLessons = progressRecords.filter((p) => p.status === "completed").length;
  const progress = Math.round((completedLessons / totalLessons) * 100);

  const lessons = allLessons.map((lesson) => {
    const progressData = progressMap.get(lesson.id);
    return {
      lessonId: lesson.id,
      status: (progressData?.status || "not_started") as "not_started" | "in_progress" | "completed",
      watchedTime: progressData?.watchedTime || 0,
    };
  });

  return {
    progress,
    completedLessons,
    totalLessons,
    lessons,
  };
}

/**
 * Валидация бизнес-правил для создания enrollment
 */
export async function validateEnrollmentCreation(
  userId: string,
  courseId: string,
  startDate?: Date,
  expiresAt?: Date | null
): Promise<{
  isValid: boolean;
  errors: string[];
}> {
  const errors: string[] = [];

  // Проверяем существование пользователя
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });

  if (!user) {
    errors.push("Пользователь не найден");
  }

  // Проверяем существование курса
  const course = await db.course.findUnique({
    where: { id: courseId },
    select: { id: true, isPublished: true },
  });

  if (!course) {
    errors.push("Курс не найден");
  } else if (!course.isPublished) {
    errors.push("Курс еще не опубликован");
  }

  // Проверяем даты
  if (startDate && expiresAt && startDate >= expiresAt) {
    errors.push("Дата начала должна быть раньше даты окончания");
  }

  if (expiresAt && expiresAt < new Date()) {
    errors.push("Дата окончания не может быть в прошлом");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

