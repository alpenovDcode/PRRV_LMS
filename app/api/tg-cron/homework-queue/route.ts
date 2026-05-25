import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

const CRON_SECRET = process.env.TG_CRON_SECRET || "";
const AI_CHECKER_URL = process.env.AI_CHECKER_URL || "http://localhost:3000";
const AI_CHECKER_KEY = process.env.AI_CHECKER_KEY || "";
const AI_CALLBACK_SECRET = process.env.AI_CALLBACK_SECRET || AI_CHECKER_KEY;
const PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://prrv.tech";
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 5 * 60 * 1000; // 5 минут между попытками

/**
 * POST /api/tg-cron/homework-queue
 *
 * Обрабатывает очередь HomeworkAIQueue. Поддерживает два режима:
 *
 *   mode: "auto_approve" — legacy. POST на ${AI_CHECKER}/api/homework/check
 *     (синхронный, до 5 мин). AI-checker сам зальёт результат через
 *     /api/homework/ai-result, что обновит статус ДЗ напрямую.
 *
 *   mode: "suggest" — новая «Проверка от Джарвикса». POST на async endpoint
 *     ${AI_CHECKER}/api/homework/analyze с callbackUrl. Ждём 15с ACK.
 *     Результат позже придёт на /api/internal/ai-callback/[id] и попадёт
 *     в ai_suggested_*. Куратор увидит вердикт и сам решит.
 */
export async function POST(request: NextRequest) {
  const secret =
    request.headers.get("x-cron-secret") ||
    request.nextUrl.searchParams.get("secret") ||
    "";
  if (CRON_SECRET && secret !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  const items = await db.homeworkAIQueue.findMany({
    where: {
      status: "waiting",
      checkAfter: { lte: now },
      attempts: { lt: MAX_ATTEMPTS },
    },
    take: 10,
    orderBy: { checkAfter: "asc" },
  });

  if (items.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, errors: 0 });
  }

  // Lock — переводим в processing, чтобы другой инстанс крона не подхватил.
  await db.homeworkAIQueue.updateMany({
    where: { id: { in: items.map((i) => i.id) } },
    data: { status: "processing" },
  });

  let processed = 0;
  let errors = 0;

  for (const item of items) {
    // Если куратор уже проверил — убираем из очереди.
    const sub = await db.homeworkSubmission.findUnique({
      where: { id: item.submissionId },
      select: { status: true, aiAnalyzedAt: true },
    });
    if (!sub) {
      await db.homeworkAIQueue.delete({ where: { id: item.id } }).catch(() => {});
      processed++;
      continue;
    }

    // Для suggest-режима: если callback уже пришёл — задача отработана.
    if (item.mode === "suggest" && sub.aiAnalyzedAt) {
      await db.homeworkAIQueue.delete({ where: { id: item.id } }).catch(() => {});
      processed++;
      continue;
    }

    // Для auto_approve: если ДЗ уже не pending — убираем из очереди.
    if (item.mode === "auto_approve" && sub.status !== "pending") {
      await db.homeworkAIQueue.delete({ where: { id: item.id } }).catch(() => {});
      processed++;
      continue;
    }

    try {
      const result =
        item.mode === "suggest"
          ? await runSuggestMode(item)
          : await runAutoApproveMode(item);

      if (result.ok) {
        await db.homeworkAIQueue.delete({ where: { id: item.id } });
        processed++;
      } else {
        await db.homeworkAIQueue.update({
          where: { id: item.id },
          data: {
            status: "waiting",
            attempts: item.attempts + 1,
            lastError: result.error.slice(0, 300),
            checkAfter: new Date(Date.now() + RETRY_DELAY_MS),
          },
        });
        errors++;
      }
    } catch (err) {
      await db.homeworkAIQueue.update({
        where: { id: item.id },
        data: {
          status: "waiting",
          attempts: item.attempts + 1,
          lastError: String(err).slice(0, 300),
          checkAfter: new Date(Date.now() + RETRY_DELAY_MS),
        },
      });
      errors++;
    }
  }

  // Если суджест-задача превысила MAX_ATTEMPTS — записываем ошибку в submission,
  // чтобы куратор увидел её в UI вместо бесконечного «анализируется».
  await markExhaustedSuggestItems();

  return NextResponse.json({ ok: true, processed, errors, total: items.length });
}

// ─── Режим "auto_approve" (legacy) ──────────────────────────────────────────

async function runAutoApproveMode(
  item: Awaited<ReturnType<typeof db.homeworkAIQueue.findMany>>[number]
): Promise<{ ok: true } | { ok: false; error: string }> {
  const resp = await fetch(`${AI_CHECKER_URL}/api/homework/check`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": AI_CHECKER_KEY,
    },
    body: JSON.stringify({
      submissionId: item.submissionId,
      studentAnswer: item.studentAnswer,
      aiPrompt: item.aiPrompt,
      aiContext: item.aiContext,
      imageFiles: item.imageFiles,
      lessonTitle: item.lessonTitle,
      lessonContent: item.lessonContent,
      studentName: item.studentName,
    }),
    signal: AbortSignal.timeout(300_000),
  });

  if (resp.ok) return { ok: true };
  const errText = await resp.text();
  return { ok: false, error: `HTTP ${resp.status}: ${errText.slice(0, 300)}` };
}

// ─── Режим "suggest" (Проверка от Джарвикса) ────────────────────────────────

async function runSuggestMode(
  item: Awaited<ReturnType<typeof db.homeworkAIQueue.findMany>>[number]
): Promise<{ ok: true } | { ok: false; error: string }> {
  const callbackUrl = `${PUBLIC_APP_URL}/api/internal/ai-callback/${item.submissionId}`;

  const resp = await fetch(`${AI_CHECKER_URL}/api/homework/analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": AI_CHECKER_KEY,
      "ngrok-skip-browser-warning": "true",
    },
    body: JSON.stringify({
      submissionId: item.submissionId,
      callbackUrl,
      callbackSecret: AI_CALLBACK_SECRET,
      studentAnswer: item.studentAnswer,
      aiPrompt: item.aiPrompt,
      aiContext: item.aiContext,
      imageFiles: item.imageFiles,
      lessonTitle: item.lessonTitle,
      lessonContent: item.lessonContent,
      studentName: item.studentName,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  // 202 = async принят, callback придёт позже → задачу из очереди удаляем.
  if (resp.status === 202) return { ok: true };

  // 200 = legacy sync вернул результат прямо здесь. Если есть verdict —
  // пишем в ai_suggested_* и убираем из очереди.
  if (resp.ok) {
    try {
      const body = await resp.json();
      if (body?.verdict && body?.comment) {
        await db.homeworkSubmission.update({
          where: { id: item.submissionId },
          data: {
            aiSuggestedVerdict: body.verdict,
            aiSuggestedComment: body.comment,
            aiAnalyzedAt: new Date(),
            aiAnalysisError: null,
          } as any,
        });
      }
    } catch {
      // не-JSON или пустое тело — всё равно считаем ok=true,
      // если callback придёт — он добьёт.
    }
    return { ok: true };
  }

  const errText = await resp.text();
  return { ok: false, error: `HTTP ${resp.status}: ${errText.slice(0, 300)}` };
}

// ─── Завершение suggest-задач, превысивших лимит попыток ────────────────────

async function markExhaustedSuggestItems(): Promise<void> {
  const exhausted = await db.homeworkAIQueue.findMany({
    where: {
      mode: "suggest",
      attempts: { gte: MAX_ATTEMPTS },
      status: "waiting",
    },
    select: { id: true, submissionId: true, lastError: true },
  });

  for (const item of exhausted) {
    await db.homeworkSubmission
      .update({
        where: { id: item.submissionId },
        data: {
          aiAnalysisError:
            `AI-checker недоступен после ${MAX_ATTEMPTS} попыток. ${item.lastError ?? ""}`.slice(0, 500),
        } as any,
      })
      .catch(() => {});
    await db.homeworkAIQueue.delete({ where: { id: item.id } }).catch(() => {});
  }
}
