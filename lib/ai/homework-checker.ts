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

  const result = (await response.json()) as HomeworkCheckResult;

  await db.homeworkSubmission.update({
    where: { id: submissionId },
    data: {
      status: result.verdict,
      curatorComment: result.comment,
      curatorId: null, // null = проверено AI, не куратором
      reviewedAt: new Date(),
    },
  });
}
