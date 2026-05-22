import { db } from "./db";
import { HomeworkStatus } from "@prisma/client";
import { sanitizeText } from "./sanitize";

/**
 * Логика версионности домашних заданий
 */

// Санитизация контента домашки с учётом «анкетных» уроков.
//
// ВАЖНО: уроки типа certification_form / тесты-анкеты присылают
// content как сериализованный JSON со всеми ответами — 47+ вопросов
// сертификации легко дают 11–14 КБ. Стандартный sanitizeText режет
// строку на MAX_LENGTH=10000 (lib/content-sanitization.ts) и ломает
// JSON посередине — ответы становятся нечитаемыми.
//
// Решение (то же, что в app/api/lessons/[id]/homework/route.ts):
// если content — валидный JSON, храним as-is с hard-cap 200 КБ;
// иначе — обычная санитизация. XSS-риска нет: viewer не рендерит
// content как HTML, React экранирует строковые ответы.
async function sanitizeHomeworkContent(content: string): Promise<string> {
  const trimmed = content.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      JSON.parse(trimmed);
      return trimmed.length <= 200_000
        ? trimmed
        : trimmed.substring(0, 200_000);
    } catch {
      // Похоже на JSON, но не парсится — фолбэк на санитайзер.
    }
  }
  return sanitizeText(content);
}

/**
 * Создает новую версию домашнего задания
 */
export async function createHomeworkVersion(
  submissionId: string,
  content: string,
  files?: string[],
  status?: HomeworkStatus
): Promise<string> {
  const submission = await db.homeworkSubmission.findUnique({
    where: { id: submissionId },
    select: {
      id: true,
      content: true,
      files: true,
      status: true,
      curatorComment: true,
      curatorId: true,
    },
  });

  if (!submission) {
    throw new Error("Submission not found");
  }

  // Санитизируем контент (JSON-анкеты сохраняем целиком, не обрезаем).
  const sanitizedContent = await sanitizeHomeworkContent(content);

  // Создаем запись в истории
  const history = await db.homeworkHistory.create({
    data: {
      submissionId,
      content: sanitizedContent,
      files: files || (submission.files as string[]) || [],
      status: status || submission.status,
      curatorComment: submission.curatorComment
        ? await sanitizeText(submission.curatorComment)
        : null,
      curatorId: submission.curatorId,
    },
  });

  return history.id;
}

/**
 * Обновляет домашнее задание и создает версию в истории
 */
export async function updateHomeworkWithHistory(
  submissionId: string,
  updates: {
    content?: string;
    files?: string[];
    status?: HomeworkStatus;
    curatorComment?: string;
    curatorId?: string;
  }
): Promise<void> {
  await db.$transaction(async (tx) => {
    // Получаем текущее состояние
    const submission = await tx.homeworkSubmission.findUnique({
      where: { id: submissionId },
    });

    if (!submission) {
      throw new Error("Submission not found");
    }

    // Создаем версию в истории перед обновлением
    await tx.homeworkHistory.create({
      data: {
        submissionId,
        content: submission.content || null,
        files: submission.files || [],
        status: submission.status,
        curatorComment: submission.curatorComment || null,
        curatorId: submission.curatorId || null,
      },
    });

    // Обновляем основную запись
    await tx.homeworkSubmission.update({
      where: { id: submissionId },
      data: {
        content: updates.content
          ? await sanitizeHomeworkContent(updates.content)
          : undefined,
        files: updates.files || undefined,
        status: updates.status || undefined,
        curatorComment: updates.curatorComment
          ? await sanitizeText(updates.curatorComment)
          : undefined,
        curatorId: updates.curatorId || undefined,
        reviewedAt: updates.status && updates.status !== "pending" ? new Date() : undefined,
      },
    });
  });
}

/**
 * Получает историю версий домашнего задания
 */
export async function getHomeworkHistory(submissionId: string) {
  return db.homeworkHistory.findMany({
    where: { submissionId },
    orderBy: { createdAt: "asc" },
    include: {
      curator: {
        select: {
          id: true,
          email: true,
          fullName: true,
        },
      },
    },
  });
}

