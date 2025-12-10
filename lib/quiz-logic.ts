import { db } from "./db";
import { ProgressStatus } from "@prisma/client";

/**
 * Логика работы с квизами
 */

export interface QuizQuestion {
  id: string | number;
  type?: "single_choice" | "multiple_choice" | "text" | "code"; // Admin format might miss type
  question?: string; // Standard format
  text?: string; // Admin format
  options?: string[]; // Для single_choice и multiple_choice
  correctAnswer?: string | string[]; // Правильный ответ (Standard)
  correct?: number; // Правильный ответ (Admin - index)
  points?: number; // Баллы за вопрос
  requiresReview?: boolean; // Требует ручной проверки
}

export interface QuizContent {
  questions: QuizQuestion[];
  totalPoints?: number;
}

/**
 * Проверяет, может ли пользователь начать новую попытку квиза
 */
export async function canStartQuizAttempt(
  userId: string,
  lessonId: string
): Promise<{
  canStart: boolean;
  reason?: string;
  attemptsLeft?: number;
  nextAttemptAt?: Date;
  activeAttempt?: any; // Add active attempt to response
}> {
  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    select: {
      id: true,
      type: true,
      quizMaxAttempts: true,
      quizTimeLimit: true,
    },
  });

  if (!lesson || lesson.type !== "quiz") {
    return { canStart: false, reason: "not_a_quiz" };
  }

  // Получаем все попытки пользователя
  const attempts = await db.quizAttempt.findMany({
    where: {
      userId,
      lessonId,
    },
    orderBy: {
      attemptNumber: "desc",
    },
  });

  const maxAttempts = lesson.quizMaxAttempts || 3;
  const attemptsCount = attempts.length;

  // Проверяем, есть ли активная попытка (начата, но не завершена)
  const activeAttempt = attempts.find((a) => !a.submittedAt);
  if (activeAttempt) {
    // Проверяем тайм-лимит
    if (lesson.quizTimeLimit) {
      const timeSpent = Math.floor(
        (new Date().getTime() - activeAttempt.startedAt.getTime()) / 1000
      );
      if (timeSpent >= lesson.quizTimeLimit) {
        // Время истекло, можно начать новую попытку (но старую надо бы закрыть по-хорошему, или просто игнорировать)
        // В текущей логике мы просто возвращаем false, если есть активная попытка, даже если время вышло.
        // Но для улучшения UX можно вернуть activeAttempt с флагом time_expired
      } else {
        return {
          canStart: true, // Allow resuming!
          reason: "active_attempt_exists",
          attemptsLeft: maxAttempts - attemptsCount,
          activeAttempt: activeAttempt,
        };
      }
    } else {
      return {
        canStart: true, // Allow resuming!
        reason: "active_attempt_exists",
        attemptsLeft: maxAttempts - attemptsCount,
        activeAttempt: activeAttempt,
      };
    }
  }

  if (attemptsCount >= maxAttempts) {
    return {
      canStart: false,
      reason: "max_attempts_reached",
      attemptsLeft: 0,
    };
  }

  return {
    canStart: true,
    attemptsLeft: maxAttempts - attemptsCount,
  };
}

/**
 * Создает новую попытку квиза
 */
export async function createQuizAttempt(
  userId: string,
  lessonId: string
): Promise<{
  attemptId: string;
  attemptNumber: number;
  timeLimit?: number;
}> {
  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    select: {
      id: true,
      type: true,
      quizMaxAttempts: true,
      quizTimeLimit: true,
    },
  });

  if (!lesson || lesson.type !== "quiz") {
    throw new Error("Lesson is not a quiz");
  }

  // Получаем номер следующей попытки
  const lastAttempt = await db.quizAttempt.findFirst({
    where: {
      userId,
      lessonId,
    },
    orderBy: {
      attemptNumber: "desc",
    },
    select: {
      attemptNumber: true,
    },
  });

  const attemptNumber = (lastAttempt?.attemptNumber || 0) + 1;

  const attempt = await db.quizAttempt.create({
    data: {
      userId,
      lessonId,
      attemptNumber,
      answers: {},
      startedAt: new Date(),
    },
  });

  return {
    attemptId: attempt.id,
    attemptNumber,
    timeLimit: lesson.quizTimeLimit || undefined,
  };
}

/**
 * Автоматическая проверка квиза (для вопросов с выбором ответа)
 */
export function autoGradeQuiz(
  questions: QuizQuestion[],
  userAnswers: Record<string, any>
): {
  score: number;
  totalPoints: number;
  requiresReview: boolean;
  details: Array<{
    questionId: string | number;
    isCorrect: boolean;
    points: number;
    requiresReview: boolean;
  }>;
} {
  let score = 0;
  let requiresReview = false;
  const details: Array<{
    questionId: string | number;
    isCorrect: boolean;
    points: number;
    requiresReview: boolean;
  }> = [];

  // Calculate total points (default 1 per question if not specified)
  const totalPoints = questions.reduce((sum, q) => sum + (q.points || 1), 0);

  for (const question of questions) {
    const userAnswer = userAnswers[question.id];
    let isCorrect = false;
    let questionRequiresReview = question.requiresReview || false;
    const points = question.points || 1;

    // Determine type (default to single_choice if missing)
    const type = question.type || "single_choice";

    if (type === "single_choice") {
      if (question.correctAnswer !== undefined) {
        isCorrect = userAnswer === question.correctAnswer;
      } else if (question.correct !== undefined && question.options) {
        // Admin format: correct is index
        const correctOption = question.options[question.correct];
        isCorrect = userAnswer === correctOption;
      }
    } else if (type === "multiple_choice") {
      const correctAnswers = Array.isArray(question.correctAnswer)
        ? question.correctAnswer
        : [];
      const userAnswersArray = Array.isArray(userAnswer) ? userAnswer : [];
      isCorrect =
        correctAnswers.length === userAnswersArray.length &&
        correctAnswers.every((ans) => userAnswersArray.includes(ans));
    } else if (type === "text" || type === "code") {
      // Текстовые вопросы требуют ручной проверки
      questionRequiresReview = true;
      requiresReview = true;
    }

    if (isCorrect && !questionRequiresReview) {
      score += points;
    }

    details.push({
      questionId: question.id,
      isCorrect,
      points: isCorrect && !questionRequiresReview ? points : 0,
      requiresReview: questionRequiresReview,
    });
  }

  return {
    score: totalPoints > 0 ? Math.round((score / totalPoints) * 100) : 0, // Процент
    totalPoints,
    requiresReview,
    details,
  };
}

/**
 * Сохраняет ответы и проверяет квиз
 */
export async function submitQuizAttempt(
  attemptId: string,
  answers: Record<string, any>
): Promise<{
  score: number;
  isPassed: boolean;
  requiresReview: boolean;
  timeSpent: number;
}> {
  const attempt = await db.quizAttempt.findUnique({
    where: { id: attemptId },
    include: {
      lesson: {
        select: {
          content: true,
          quizPassingScore: true,
          quizTimeLimit: true,
          quizRequiresReview: true,
        },
      },
    },
  });

  if (!attempt) {
    throw new Error("Attempt not found");
  }

  if (attempt.submittedAt) {
    throw new Error("Attempt already submitted");
  }

  // Вычисляем время, потраченное на квиз
  const timeSpent = Math.floor(
    (new Date().getTime() - attempt.startedAt.getTime()) / 1000
  );

  // Проверяем тайм-лимит
  if (attempt.lesson.quizTimeLimit && timeSpent > attempt.lesson.quizTimeLimit) {
    throw new Error("Time limit exceeded");
  }

  // Получаем вопросы из контента урока
  const quizContent = attempt.lesson.content as unknown as QuizContent;
  const questions = quizContent?.questions || [];

  // Автоматическая проверка
  const gradingResult = autoGradeQuiz(questions, answers);

  const passingScore = attempt.lesson.quizPassingScore || 70;
  const isPassed = gradingResult.score >= passingScore;
  const requiresReview =
    gradingResult.requiresReview || attempt.lesson.quizRequiresReview;

  // Обновляем попытку
  await db.quizAttempt.update({
    where: { id: attemptId },
    data: {
      answers,
      score: gradingResult.score,
      isPassed: isPassed && !requiresReview, // Если требует проверки, пока не пройден
      isAutoGraded: !requiresReview,
      requiresReview,
      submittedAt: new Date(),
      timeSpent,
    },
  });

  // Обновляем прогресс урока
  if (isPassed && !requiresReview) {
    await db.lessonProgress.upsert({
      where: {
        userId_lessonId: {
          userId: attempt.userId,
          lessonId: attempt.lessonId,
        },
      },
      update: {
        status: ProgressStatus.completed,
        completedAt: new Date(),
      },
      create: {
        userId: attempt.userId,
        lessonId: attempt.lessonId,
        status: ProgressStatus.completed,
        completedAt: new Date(),
      },
    });
  } else if (!isPassed) {
    await db.lessonProgress.upsert({
      where: {
        userId_lessonId: {
          userId: attempt.userId,
          lessonId: attempt.lessonId,
        },
      },
      update: {
        status: ProgressStatus.failed,
      },
      create: {
        userId: attempt.userId,
        lessonId: attempt.lessonId,
        status: ProgressStatus.failed,
      },
    });
  }

  return {
    score: gradingResult.score,
    isPassed: isPassed && !requiresReview,
    requiresReview,
    timeSpent,
  };
}

/**
 * Ручная проверка квиза куратором
 */
export async function reviewQuizAttempt(
  attemptId: string,
  curatorId: string,
  score: number,
  comment?: string
): Promise<void> {
  const attempt = await db.quizAttempt.findUnique({
    where: { id: attemptId },
    include: {
      lesson: {
        select: {
          quizPassingScore: true,
        },
      },
    },
  });

  if (!attempt) {
    throw new Error("Attempt not found");
  }

  if (!attempt.requiresReview) {
    throw new Error("Attempt does not require review");
  }

  const passingScore = attempt.lesson.quizPassingScore || 70;
  const isPassed = score >= passingScore;

  await db.$transaction(async (tx) => {
    // Обновляем попытку
    await tx.quizAttempt.update({
      where: { id: attemptId },
      data: {
        score,
        isPassed,
        curatorId,
        curatorComment: comment || null,
        isAutoGraded: false,
        requiresReview: false,
      },
    });

    // Обновляем прогресс урока
    await tx.lessonProgress.upsert({
      where: {
        userId_lessonId: {
          userId: attempt.userId,
          lessonId: attempt.lessonId,
        },
      },
      update: {
        status: isPassed ? ProgressStatus.completed : ProgressStatus.failed,
        completedAt: isPassed ? new Date() : undefined,
      },
      create: {
        userId: attempt.userId,
        lessonId: attempt.lessonId,
        status: isPassed ? ProgressStatus.completed : ProgressStatus.failed,
        completedAt: isPassed ? new Date() : undefined,
      },
    });
  });
}

/**
 * Сброс попыток квиза (для админа/куратора)
 */
export async function resetQuizAttempts(
  userId: string,
  lessonId: string,
  resetBy: string
): Promise<void> {
  // Удаляем все попытки
  await db.quizAttempt.deleteMany({
    where: {
      userId,
      lessonId,
    },
  });

  // Сбрасываем прогресс урока
  await db.lessonProgress.updateMany({
    where: {
      userId,
      lessonId,
    },
    data: {
      status: ProgressStatus.not_started,
      completedAt: null,
    },
  });

  // Audit log
  await db.auditLog.create({
    data: {
      userId: resetBy,
      action: "RESET_QUIZ_ATTEMPTS",
      entity: "quiz",
      entityId: lessonId,
      details: {
        targetUserId: userId,
        lessonId,
      },
    },
  });
}

