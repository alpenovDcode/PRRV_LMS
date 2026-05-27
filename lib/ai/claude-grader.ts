/**
 * lib/ai/claude-grader.ts
 *
 * Прямой вызов Claude API через Anthropic SDK для проверки ДЗ.
 *
 * Используется как fallback когда внешний AI-checker недоступен — мы
 * сами вызываем Anthropic API и записываем результат в submission.
 *
 * Возвращает строгий JSON { verdict, comment } — для этого используем
 * tool_use с required schema (gardenrails вокруг текстового вывода).
 *
 * Env:
 *   ANTHROPIC_API_KEY — обязателен
 *   CLAUDE_MODEL      — модель, default "claude-sonnet-4-5" (баланс цена/качество)
 */

import Anthropic from "@anthropic-ai/sdk";

export interface ClaudeGradeInput {
  /** AI-prompt урока — критерии оценки */
  aiPrompt: string;
  /** Дополнительный контекст урока (опционально) */
  aiContext?: string | null;
  /** Текст ответа студента */
  studentAnswer: string;
  /** Имя студента (для контекста, чтобы Claude обращался по имени в comment) */
  studentName: string;
  /** Название урока */
  lessonTitle: string;
  /** Контент урока (опционально, может быть массивом блоков или строкой) */
  lessonContent?: unknown;
  /** URL картинок прикреплённых к ДЗ (если урок с hasImageAnalysis) */
  imageFiles?: string[];
}

export interface ClaudeGradeResult {
  verdict: "approved" | "rejected";
  comment: string;
}

const DEFAULT_MODEL = process.env.CLAUDE_MODEL ?? "claude-sonnet-4-5";

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (_client) return _client;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY не задан");
  _client = new Anthropic({ apiKey: key });
  return _client;
}

/**
 * Сериализует lessonContent в текст. Принимает строку, массив блоков-объектов,
 * или null/undefined.
 */
function lessonContentToText(content: unknown): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  try {
    return JSON.stringify(content, null, 2).slice(0, 4000);
  } catch {
    return "";
  }
}

/**
 * Проверяет ДЗ через Claude. Бросает Error если SDK упал
 * (rate limit, network, invalid response).
 */
export async function gradeWithClaude(input: ClaudeGradeInput): Promise<ClaudeGradeResult> {
  const client = getClient();

  const system = `Ты эксперт-куратор образовательной платформы ПРОРЫВ. Твоя задача — проверить ДЗ студента по заданным критериям.

ОЧЕНЬ ВАЖНО:
- Отвечай на русском языке.
- Будь конкретен и доброжелателен.
- Не придумывай критерии, которых нет в задании.
- Если ответ удовлетворяет всем критериям — verdict = "approved".
- Если хотя бы один критерий не выполнен — verdict = "rejected", и в comment объясни ЧТО именно нужно доработать.
- Comment — 2-5 предложений, без воды.`;

  const userText =
    `# Урок: ${input.lessonTitle}\n\n` +
    `## Критерии проверки\n${input.aiPrompt}\n\n` +
    (input.aiContext ? `## Дополнительный контекст\n${input.aiContext}\n\n` : "") +
    (input.lessonContent ? `## Материал урока\n${lessonContentToText(input.lessonContent)}\n\n` : "") +
    `## Ответ студента (${input.studentName})\n${input.studentAnswer || "(пусто)"}`;

  // Собираем content для message: текст + опциональные картинки через vision.
  const userContent: Anthropic.MessageParam["content"] = [{ type: "text", text: userText }];

  if (input.imageFiles && input.imageFiles.length > 0) {
    for (const url of input.imageFiles.slice(0, 10)) {
      // Anthropic SDK поддерживает image source с типом "url".
      userContent.push({
        type: "image",
        source: { type: "url", url } as any,
      });
    }
  }

  // tool_use для строгого JSON.
  const response = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 1024,
    system,
    messages: [{ role: "user", content: userContent }],
    tools: [
      {
        name: "submit_grade",
        description: "Записать вердикт по ДЗ студента.",
        input_schema: {
          type: "object",
          properties: {
            verdict: {
              type: "string",
              enum: ["approved", "rejected"],
              description: "Одобрить или отклонить ДЗ",
            },
            comment: {
              type: "string",
              description: "Комментарий студенту на русском, 2-5 предложений",
            },
          },
          required: ["verdict", "comment"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "submit_grade" },
  });

  // Извлекаем tool_use блок
  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Claude не вернул tool_use — ответ невалидный");
  }
  const args = toolUse.input as any;
  if (
    !args ||
    !["approved", "rejected"].includes(args.verdict) ||
    typeof args.comment !== "string" ||
    !args.comment.trim()
  ) {
    throw new Error("Claude вернул некорректные поля verdict/comment");
  }

  return {
    verdict: args.verdict,
    comment: args.comment.trim(),
  };
}
