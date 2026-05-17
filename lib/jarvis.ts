import { db } from "@/lib/db";
import { UserRole } from "@prisma/client";

// Используется в after() при создании вопроса/сообщения — ждёт delay, потом отвечает.
// Cron вызывает generateJarvisReply() напрямую (без delay — он уже проверил время).
export async function scheduleJarvisReply(questionId: string): Promise<void> {
  const delayMs = parseInt(process.env.JARVIS_DELAY_MS || "300000", 10);
  if (delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  await generateJarvisReply(questionId);
}

const SENDER_NAME = "Джарвикс";

const SYSTEM_PROMPT = `Ты — Джарвикс, помощник команды онлайн-школы «Прорыв». Ты помогаешь ученикам разобраться с вопросами по учёбе.

Правила:
- Пиши по-русски, тепло и дружелюбно, как живой человек из команды
- Обращайся на «ты»
- Не раскрывай, что ты — ИИ или бот
- Дай полезный ответ по существу последнего сообщения ученика
- Если вопрос требует доступа к личным данным — скажи, что куратор скоро ответит подробнее
- Ответ не длиннее 4–5 предложений, лаконично и по делу
- Никаких заголовков, списков и маркдауна — только живой текст`;

interface RawMessage {
  content: string;
  isAiReply: boolean;
  aiSenderName: string | null;
  authorId: string | null;
  createdAt: Date;
  author: { role: string; fullName: string | null; email: string } | null;
}

function buildUserPrompt(subject: string, messages: RawMessage[]): string {
  const history = messages
    .map((m) => {
      if (m.isAiReply) return `Джарвикс: ${m.content}`;
      const role = m.author?.role === UserRole.student ? "Ученик" : "Наставник";
      return `${role}: ${m.content}`;
    })
    .join("\n");

  return `Тема вопроса: «${subject}»\n\nДиалог:\n${history}\n\nОтветь на последнее сообщение ученика как Джарвикс.`;
}

async function callAI(userPrompt: string): Promise<string> {
  const provider = process.env.JARVIS_PROVIDER || "openai";

  if (provider === "openclaw") {
    return callOpenClaw(userPrompt);
  }

  const apiKey = process.env.JARVIS_API_KEY;
  if (!apiKey) throw new Error("JARVIS_API_KEY not set");

  if (provider === "anthropic") {
    return callAnthropic(apiKey, userPrompt);
  }
  return callOpenAI(apiKey, userPrompt);
}

async function callOpenClaw(userPrompt: string): Promise<string> {
  const apiUrl = process.env.OPENCLAW_API_URL || "http://127.0.0.1:18789/v1/responses";
  const apiKey = process.env.OPENCLAW_API_KEY;
  const agentId = process.env.OPENCLAW_AGENT_ID || "main";

  if (!apiKey) throw new Error("OPENCLAW_API_KEY not set");

  const res = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "x-openclaw-agent-id": agentId,
    },
    body: JSON.stringify({
      model: "openclaw",
      input: userPrompt,
      instructions: SYSTEM_PROMPT,
      stream: false,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenClaw API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  // OpenAI Responses API format: output[].content[].text
  const text = data.output
    ?.flatMap((o: any) => o.content ?? [])
    .find((c: any) => c.type === "output_text")
    ?.text?.trim();
  if (!text) throw new Error("Empty response from OpenClaw");
  return text;
}

async function callOpenAI(apiKey: string, userPrompt: string): Promise<string> {
  const apiUrl = process.env.JARVIS_API_URL || "https://api.groq.com/openai/v1";
  const model = process.env.JARVIS_MODEL || "llama-3.3-70b-versatile";

  const res = await fetch(`${apiUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 400,
      temperature: 0.7,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI-compatible API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Empty response from AI");
  return text;
}

async function callAnthropic(apiKey: string, userPrompt: string): Promise<string> {
  const model = process.env.JARVIS_MODEL || "claude-3-5-haiku-20241022";

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 400,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const text = data.content?.[0]?.text?.trim();
  if (!text) throw new Error("Empty response from Anthropic");
  return text;
}

export async function generateJarvisReply(questionId: string): Promise<"replied" | "skipped" | "error"> {
  try {
    const question = await db.question.findUnique({
      where: { id: questionId },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
          include: {
            author: { select: { role: true, fullName: true, email: true } },
          },
        },
      },
    });

    if (!question) return "skipped";
    if (question.status === "closed") return "skipped";

    // Stop if student called a mentor — hand off to humans
    if (question.lastMentorCallAt) return "skipped";

    // Stop if any human curator/admin has written a message
    const hasHumanCuratorReply = question.messages.some(
      (m) => !m.isAiReply && m.authorId !== null && m.authorId !== question.studentId
    );
    if (hasHumanCuratorReply) return "skipped";

    // Find the last message sent by the student
    const lastStudentMsg = [...question.messages]
      .reverse()
      .find((m) => !m.isAiReply && m.authorId === question.studentId);

    if (!lastStudentMsg) return "skipped";

    // Skip if Jarvis already replied to this student message
    if (question.jarvisRepliedAt && question.jarvisRepliedAt >= lastStudentMsg.createdAt) {
      return "skipped";
    }

    const userPrompt = buildUserPrompt(question.subject, question.messages as RawMessage[]);
    const reply = await callAI(userPrompt);

    await db.$transaction([
      db.questionMessage.create({
        data: {
          questionId,
          authorId: null,
          content: reply,
          isAiReply: true,
          aiSenderName: SENDER_NAME,
        },
      }),
      db.question.update({
        where: { id: questionId },
        data: {
          jarvisRepliedAt: new Date(),
          firstResponseAt: question.firstResponseAt ?? new Date(),
        },
      }),
    ]);

    console.log(`[jarvis] replied to question ${questionId}`);
    return "replied";
  } catch (err) {
    console.error(`[jarvis] error on question ${questionId}:`, err);
    return "error";
  }
}
