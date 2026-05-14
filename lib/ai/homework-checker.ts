import { db } from "@/lib/db";

export interface HomeworkCheckResult {
  verdict: "approved" | "rejected";
  comment: string;
}

export interface HomeworkCheckParams {
  submissionId: string;
  studentAnswer: string;
  aiPrompt: string;
  aiContext: string | null;
  imageFiles?: string[];
  lessonTitle: string;
  lessonContent: unknown;
  studentName: string;
}

const AI_CHECK_DELAY_MS = parseInt(process.env.AI_CHECK_DELAY_MS || "1200000"); // 20 минут

/**
 * Отправляет ДЗ студента на внешний AI-чекер (Flask/Claude) и обновляет submission в БД.
 * Предназначена для вызова в фоне (без await).
 */
export async function checkHomeworkWithAI(
  params: HomeworkCheckParams
): Promise<void> {
  const {
    submissionId,
    studentAnswer,
    aiPrompt,
    aiContext,
    imageFiles = [],
    lessonTitle,
    lessonContent,
    studentName,
  } = params;

  // Задержка перед проверкой — даёт куратору возможность проверить вручную
  if (AI_CHECK_DELAY_MS > 0) {
    await new Promise((resolve) => setTimeout(resolve, AI_CHECK_DELAY_MS));
  }

  // Если за время ожидания куратор уже проверил — не перезаписываем его решение
  const current = await db.homeworkSubmission.findUnique({
    where: { id: submissionId },
    select: { status: true, curatorId: true },
  });
  if (current && current.status !== "pending") {
    return;
  }

  const baseUrl = process.env.AI_CHECKER_URL || "http://localhost:3000";
  const apiKey = process.env.AI_CHECKER_KEY || "";

  const response = await fetch(`${baseUrl}/api/homework/check`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify({
      submissionId,
      studentAnswer,
      aiPrompt,
      aiContext,
      imageFiles,
      lessonTitle,
      lessonContent,
      studentName,
    }),
    signal: AbortSignal.timeout(300_000),
  });

  if (!response.ok) {
    throw new Error(
      `AI checker API error: ${response.status} ${await response.text()}`
    );
  }

  const result = await response.json();

  // AI отправил на апрув куратору — ЛМС ждёт callback /api/homework/ai-result
  if ((result as any).status === "pending_approval") {
    console.log(`Homework ${submissionId} sent for human approval in Pachca`);
    return;
  }

  const checkerResult = result as HomeworkCheckResult;

  await db.homeworkSubmission.update({
    where: { id: submissionId },
    data: {
      status: checkerResult.verdict,
      curatorComment: checkerResult.comment,
      curatorId: null,
      reviewedAt: new Date(),
    },
  });
}
