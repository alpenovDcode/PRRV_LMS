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
 * Использует stream() — единственный поддерживаемый способ для этой модели.
 */
async function callGemini(prompt: string): Promise<string> {
  const chunks: string[] = [];

  const stream = replicate.stream("google/gemini-3-flash", {
    input: {
      prompt,
      max_tokens: 1024,
      temperature: 0.3,
    },
  });

  for await (const event of stream) {
    if (typeof event === "string") {
      chunks.push(event);
    } else if (event?.data) {
      chunks.push(String(event.data));
    }
  }

  return chunks.join("");
}

/**
 * Извлекает JSON из ответа модели.
 * Ищет первый валидный JSON-объект методом поиска сбалансированных скобок.
 */
function parseVerdict(raw: string): HomeworkCheckResult {
  console.log("[AI homework] raw response:", raw.slice(0, 500));

  // Убираем markdown-обёртку если есть
  const cleaned = raw
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  // Ищем первый валидный JSON-объект по балансу скобок
  const start = cleaned.indexOf("{");
  if (start === -1) {
    throw new Error(`JSON-объект не найден в ответе: ${cleaned.slice(0, 200)}`);
  }

  let depth = 0;
  let end = -1;
  for (let i = start; i < cleaned.length; i++) {
    if (cleaned[i] === "{") depth++;
    else if (cleaned[i] === "}") {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }

  if (end === -1) {
    throw new Error(`Незакрытый JSON-объект в ответе: ${cleaned.slice(0, 200)}`);
  }

  const jsonStr = cleaned.slice(start, end + 1);
  const parsed = JSON.parse(jsonStr);

  if (!parsed.verdict || !["approved", "rejected"].includes(parsed.verdict)) {
    throw new Error(`Некорректный verdict: "${parsed.verdict}". Полный ответ: ${jsonStr}`);
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
