import Replicate from "replicate";
import { db } from "@/lib/db";

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

export interface HomeworkCheckResult {
  verdict: "approved" | "rejected";
  comment: string;
}

/**
 * Вызывает Gemini Flash через Replicate для проверки ответа студента.
 * Возвращает вердикт и комментарий куратора.
 */
async function callGemini(prompt: string): Promise<string> {
  // replicate.run возвращает строку или массив строк в зависимости от модели
  const output = await replicate.run("google/gemini-flash-1.5" as any, {
    input: {
      prompt,
      max_tokens: 1024,
      temperature: 0.3, // Низкая температура для стабильного JSON
    },
  });

  if (Array.isArray(output)) {
    return output.join("");
  }
  return String(output);
}

/**
 * Извлекает JSON из ответа модели.
 * Модель может обернуть JSON в markdown-блок ```json ... ```
 */
function parseVerdict(raw: string): HomeworkCheckResult {
  // Убираем markdown-обёртку если есть
  const cleaned = raw
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  // Ищем первый JSON-объект в тексте
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`Не удалось найти JSON в ответе модели: ${raw}`);
  }

  const parsed = JSON.parse(jsonMatch[0]);

  if (!parsed.verdict || !["approved", "rejected"].includes(parsed.verdict)) {
    throw new Error(`Некорректный verdict в ответе: ${parsed.verdict}`);
  }

  return {
    verdict: parsed.verdict,
    comment: parsed.comment || "",
  };
}

/**
 * Проверяет ответ студента с помощью AI и обновляет submission в БД.
 * Предназначена для вызова в фоне (без await).
 */
export async function checkHomeworkWithAI(
  submissionId: string,
  studentAnswer: string,
  aiPrompt: string,
  aiContext: string | null
): Promise<void> {
  const contextBlock = aiContext
    ? `\n\n## Материал урока / Эталон:\n${aiContext}`
    : "";

  const prompt = `Ты — куратор онлайн-курса. Проверь домашнее задание студента и верни ответ СТРОГО в формате JSON без лишнего текста.

## Инструкция для проверки:
${aiPrompt}${contextBlock}

## Ответ студента:
${studentAnswer}

Верни ТОЛЬКО JSON в следующем формате:
{
  "verdict": "approved" или "rejected",
  "comment": "Твой комментарий для студента на русском языке (2-5 предложений)"
}`;

  const raw = await callGemini(prompt);
  const result = parseVerdict(raw);

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
