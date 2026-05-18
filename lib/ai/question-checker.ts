import { db } from "@/lib/db";

const DELAY_MS = parseInt(process.env.JARVIS_DELAY_MS || "300000", 10); // 5 мин по умолчанию
const SENDER_NAME = "Джарвикс";

export async function scheduleQuestionAIReply(questionId: string): Promise<void> {
  if (DELAY_MS > 0) {
    await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
  }
  await generateQuestionAIReply(questionId);
}

export async function generateQuestionAIReply(
  questionId: string
): Promise<"replied" | "skipped" | "error"> {
  try {
    const question = await db.question.findUnique({
      where: { id: questionId },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
          include: {
            author: { select: { role: true, fullName: true } },
          },
        },
        student: { select: { fullName: true, email: true } },
      },
    });

    if (!question) return "skipped";
    if (question.status === "closed") return "skipped";

    // Если студент вызвал наставника — передаём людям
    if (question.lastMentorCallAt) return "skipped";

    // Если куратор/админ уже ответил — не вмешиваемся
    const hasHumanCuratorReply = question.messages.some(
      (m) => !m.isAiReply && m.authorId !== null && m.authorId !== question.studentId
    );
    if (hasHumanCuratorReply) return "skipped";

    // Находим последнее сообщение студента
    const lastStudentMsg = [...question.messages]
      .reverse()
      .find((m) => !m.isAiReply && m.authorId === question.studentId);
    if (!lastStudentMsg) return "skipped";

    // AI уже ответил на это сообщение
    if (question.jarvisRepliedAt && question.jarvisRepliedAt >= lastStudentMsg.createdAt) {
      return "skipped";
    }

    const baseUrl = process.env.AI_CHECKER_URL || "http://localhost:3000";
    const apiKey = process.env.AI_CHECKER_KEY || "";

    const messages = question.messages.map((m) => ({
      role: m.isAiReply
        ? "assistant"
        : m.authorId === question.studentId
        ? "student"
        : "curator",
      content: m.content,
    }));

    const response = await fetch(`${baseUrl}/api/questions/check`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({
        questionId,
        subject: question.subject,
        studentName: question.student.fullName || question.student.email,
        messages,
      }),
      signal: AbortSignal.timeout(300_000),
    });

    if (!response.ok) {
      throw new Error(`AI checker API error: ${response.status} ${await response.text()}`);
    }

    const result = await response.json();

    // Внешний сервис обработает асинхронно и пришлёт callback на /api/questions/ai-reply
    if ((result as any).status === "pending_approval") {
      return "skipped";
    }

    const { reply } = result as { reply: string };
    if (!reply) return "error";

    await saveQuestionAIReply(questionId, reply, question.firstResponseAt);
    console.error(`[question-ai] replied to question ${questionId}`);
    return "replied";
  } catch (err) {
    console.error(`[question-ai] error on question ${questionId}:`, err);
    return "error";
  }
}

export async function saveQuestionAIReply(
  questionId: string,
  reply: string,
  existingFirstResponseAt: Date | null
): Promise<void> {
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
        firstResponseAt: existingFirstResponseAt ?? new Date(),
      },
    }),
  ]);
}
