import Replicate from "replicate";
import { db } from "@/lib/db";

const CF_ACCOUNT_HASH =
  process.env.NEXT_PUBLIC_CLOUDFLARE_IMAGES_ACCOUNT_HASH || "LDTNFDrUnJY_bFTI66y-jw";

/**
 * Конвертирует Cloudflare Image ID в полный https-URL.
 * Если уже полный URL — возвращает как есть.
 */
function toImageUrl(fileId: string): string {
  if (fileId.startsWith("http://") || fileId.startsWith("https://")) {
    return fileId;
  }
  return `https://imagedelivery.net/${CF_ACCOUNT_HASH}/${fileId}/public`;
}

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

export interface HomeworkCheckResult {
  verdict: "approved" | "rejected";
  comment: string;
}

/**
 * Вызывает Gemini Flash через Replicate для проверки текстового ответа студента.
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
 * Вызывает GPT-4o через Replicate для проверки ответа студента с картинками.
 * Создаёт prediction через SDK и ждёт завершения с полингом.
 */
async function callGPT4o(
  prompt: string,
  systemPrompt: string,
  imageUrls: string[]
): Promise<string> {
  const prediction = await replicate.predictions.create({
    model: "openai/gpt-4o",
    input: {
      prompt,
      system_prompt: systemPrompt,
      image_input: imageUrls,
      max_completion_tokens: 4096,
      temperature: 1,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0,
      messages: [],
    },
  });

  const completed = await replicate.wait(prediction);

  if (completed.error) {
    throw new Error(`GPT-4o error: ${completed.error}`);
  }

  console.log("[AI homework] GPT-4o raw output:", JSON.stringify(completed.output)?.slice(0, 500));

  if (Array.isArray(completed.output)) {
    return completed.output.join("");
  }

  return String(completed.output || "");
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
 * Если переданы imageFiles — использует GPT-4o с анализом картинок.
 * Предназначена для вызова в фоне (без await).
 */
export async function checkHomeworkWithAI(
  submissionId: string,
  studentAnswer: string,
  aiPrompt: string,
  aiContext: string | null,
  imageFiles: string[] = []
): Promise<void> {
  const contextBlock = aiContext
    ? `\n\n## Материал урока / Эталон:\n${aiContext}`
    : "";

  let raw: string;

  if (imageFiles.length > 0) {
    // Анализ с картинками через GPT-4o
    const userPrompt = studentAnswer
      ? `## Ответ студента:\n${studentAnswer}\n\nВерни ТОЛЬКО JSON в следующем формате:\n{\n  "verdict": "approved" или "rejected",\n  "comment": "Твой комментарий для студента на русском языке (2-5 предложений)"\n}`
      : `Проанализируй прикреплённые изображения и вынеси вердикт.\n\nВерни ТОЛЬКО JSON в следующем формате:\n{\n  "verdict": "approved" или "rejected",\n  "comment": "Твой комментарий для студента на русском языке (2-5 предложений)"\n}`;

    const systemPrompt = `Ты — куратор онлайн-курса. Проверь домашнее задание студента и верни ответ СТРОГО в формате JSON без лишнего текста.\n\n## Инструкция для проверки:\n${aiPrompt}${contextBlock}`;

    raw = await callGPT4o(userPrompt, systemPrompt, imageFiles.map(toImageUrl));
    console.log("[AI homework] GPT-4o response length:", raw.length);
  } else {
    // Текстовая проверка через Gemini
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

    raw = await callGemini(prompt);
  }

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
