import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

const CRON_SECRET = process.env.TG_CRON_SECRET || "";
const AI_CHECKER_URL = process.env.AI_CHECKER_URL || "http://localhost:3000";
const AI_CHECKER_KEY = process.env.AI_CHECKER_KEY || "";
const AI_CALLBACK_SECRET = process.env.AI_CALLBACK_SECRET || AI_CHECKER_KEY;
const PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://prrv.tech";

/**
 * Maximum попыток до того как пометим как exhausted. С backoff'ом ниже
 * 10 попыток покрывают ~50 часов — достаточно чтобы пережить любой
 * realistic outage AI-checker'а.
 */
const MAX_ATTEMPTS = 10;

/**
 * Экспоненциальный backoff. Возвращает задержку перед следующей попыткой
 * (в мс) на основе attempt-номера (0..N).
 *
 *   attempt=0 → 1 мин      (первый retry — мог быть короткий blip)
 *   attempt=1 → 2 мин
 *   attempt=2 → 5 мин
 *   attempt=3 → 15 мин
 *   attempt=4 → 30 мин
 *   attempt=5 → 1 час
 *   attempt=6 → 2 часа
 *   attempt=7 → 4 часа
 *   attempt=8 → 8 часов
 *   attempt=9 → 24 часа
 */
function nextRetryDelayMs(attempts: number): number {
  const minutes = [1, 2, 5, 15, 30, 60, 120, 240, 480, 1440];
  return (minutes[Math.min(attempts, minutes.length - 1)] ?? 1440) * 60_000;
}

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
        const nextAttempts = item.attempts + 1;
        await db.homeworkAIQueue.update({
          where: { id: item.id },
          data: {
            status: "waiting",
            attempts: nextAttempts,
            lastError: result.error.slice(0, 300),
            checkAfter: new Date(Date.now() + nextRetryDelayMs(nextAttempts)),
          },
        });
        errors++;
      }
    } catch (err) {
      const nextAttempts = item.attempts + 1;
      await db.homeworkAIQueue.update({
        where: { id: item.id },
        data: {
          status: "waiting",
          attempts: nextAttempts,
          lastError: String(err).slice(0, 300),
          checkAfter: new Date(Date.now() + nextRetryDelayMs(nextAttempts)),
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
  // Сначала пробуем AI-checker.
  try {
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

    // 200 = legacy sync вернул результат прямо здесь.
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
      } catch {}
      return { ok: true };
    }

    // не-2xx от AI-checker → проваливаемся в Claude fallback
    const errText = await resp.text();
    console.warn(
      `[homework-queue] AI-checker HTTP ${resp.status} for ${item.submissionId}, trying Claude fallback`
    );
    return await tryClaudeFallback(item, `HTTP ${resp.status}: ${errText.slice(0, 200)}`);
  } catch (e) {
    // Timeout / network → проваливаемся в Claude fallback
    const errMsg = e instanceof Error ? e.message : String(e);
    console.warn(
      `[homework-queue] AI-checker failed for ${item.submissionId}: ${errMsg}. Trying Claude.`
    );
    return await tryClaudeFallback(item, errMsg);
  }
}

/**
 * Пробуем вызвать Claude напрямую. Если ANTHROPIC_API_KEY не задан или
 * Claude упал — возвращаем ошибку (cron сделает retry с backoff).
 */
async function tryClaudeFallback(
  item: Awaited<ReturnType<typeof db.homeworkAIQueue.findMany>>[number],
  originalError: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, error: `${originalError} (Claude fallback disabled — no ANTHROPIC_API_KEY)` };
  }

  try {
    const { gradeWithClaude } = await import("@/lib/ai/claude-grader");
    const result = await gradeWithClaude({
      aiPrompt: item.aiPrompt,
      aiContext: item.aiContext ?? null,
      studentAnswer: item.studentAnswer,
      studentName: item.studentName,
      lessonTitle: item.lessonTitle,
      lessonContent: item.lessonContent,
      imageFiles: Array.isArray(item.imageFiles) ? (item.imageFiles as string[]) : [],
    });
    await db.homeworkSubmission.update({
      where: { id: item.submissionId },
      data: {
        aiSuggestedVerdict: result.verdict,
        aiSuggestedComment: result.comment,
        aiAnalyzedAt: new Date(),
        aiAnalysisError: null,
      } as any,
    });
    console.log(
      `[homework-queue] Claude fallback succeeded for ${item.submissionId} (AI-checker had: ${originalError})`
    );
    return { ok: true };
  } catch (claudeErr) {
    const claudeMsg = claudeErr instanceof Error ? claudeErr.message : String(claudeErr);
    return { ok: false, error: `AI-checker: ${originalError}; Claude: ${claudeMsg}`.slice(0, 300) };
  }
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
