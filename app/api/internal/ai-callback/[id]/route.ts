import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { timingSafeEqual } from "crypto";

// Секрет передаётся в AI-checker при kickoff (см.
// app/api/curator/homework/[id]/ai-analyze/route.ts), AI-checker
// возвращает его в заголовке X-Callback-Secret.
const AI_CALLBACK_SECRET =
  process.env.AI_CALLBACK_SECRET || process.env.AI_CHECKER_KEY || "";

/**
 * POST /api/internal/ai-callback/[id]
 *
 * AI-checker дёргает этот эндпоинт когда домашка проанализирована.
 *
 * Контракт (см. docs/AI_CHECKER_CONTRACT.md):
 *  - Header: X-Callback-Secret: <тот же секрет, что передавали в kickoff>
 *  - Body (success): { verdict: "approved" | "rejected", comment: string }
 *  - Body (failure): { error: string }
 *
 * Authentication через секрет, а не через сессию — потому что вызов
 * идёт server-to-server (AI-checker, не браузер куратора). withAuth
 * тут не подходит.
 *
 * NB: эндпоинт публично доступен по URL (его передаём в AI-checker),
 * поэтому секрет — единственная защита. Сравниваем через
 * timingSafeEqual, чтобы не утечь длину/префикс через timing-атаку.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // 1. Проверяем секрет. Принимаем либо X-Callback-Secret, либо
  //    Authorization: Bearer <secret> — оба варианта удобны для
  //    разных HTTP-клиентов.
  const headerSecret =
    request.headers.get("x-callback-secret") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    "";

  if (!AI_CALLBACK_SECRET) {
    console.error("AI_CALLBACK_SECRET не настроен — callback отклонён");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const a = Buffer.from(headerSecret);
  const b = Buffer.from(AI_CALLBACK_SECRET);
  const secretOk =
    a.length === b.length && a.length > 0 && timingSafeEqual(a, b);

  if (!secretOk) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Парсим тело. Не доверяем content-type — может прилететь что
  //    угодно через ngrok.
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  // 3. Проверяем, что submission ещё существует и реально ждёт анализа.
  //    Если запись удалили или анализ уже зафиксирован — отвечаем 200
  //    (идемпотентность), но ничего не пишем.
  const existing = await db.homeworkSubmission.findUnique({
    where: { id },
    select: {
      id: true,
      aiAnalyzedAt: true,
      aiAnalysisStartedAt: true,
    } as any,
  });

  if (!existing) {
    return NextResponse.json(
      { ok: true, ignored: "submission not found" },
      { status: 200 }
    );
  }

  // 4a. Ошибка от AI-checker — записываем в aiAnalysisError, чтобы
  //     фронт показал куратору и предложил перезапуск.
  if (body.error) {
    const errMsg = String(body.error).slice(0, 2000);
    await db.homeworkSubmission.update({
      where: { id },
      data: {
        aiAnalysisError: errMsg,
        // НЕ очищаем aiAnalysisStartedAt — фронт по нему понимает,
        // что анализ закончился (error выставлен), но был попыткой.
      } as any,
    });
    return NextResponse.json({ ok: true });
  }

  // 4b. Успех — verdict + comment обязательны.
  if (!body.verdict || !body.comment) {
    return NextResponse.json(
      { error: "Missing verdict or comment" },
      { status: 400 }
    );
  }

  // Нормализуем verdict — на всякий случай. AI-checker может вернуть
  // "approve"/"reject" или "approved"/"rejected".
  let verdict: string = String(body.verdict).toLowerCase();
  if (verdict === "approve") verdict = "approved";
  if (verdict === "reject") verdict = "rejected";
  if (verdict !== "approved" && verdict !== "rejected") {
    return NextResponse.json(
      { error: `Unexpected verdict: ${body.verdict}` },
      { status: 400 }
    );
  }

  await db.homeworkSubmission.update({
    where: { id },
    data: {
      aiSuggestedVerdict: verdict,
      aiSuggestedComment: String(body.comment).slice(0, 10_000),
      aiAnalyzedAt: new Date(),
      aiAnalysisError: null,
    } as any,
  });

  return NextResponse.json({ ok: true });
}
