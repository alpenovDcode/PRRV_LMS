import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

const CRON_SECRET = process.env.TG_CRON_SECRET || "";

/** Сколько ждать callback от AI-checker до считаем «зависшим» */
const STALE_ANALYSIS_MS = 60 * 60 * 1000; // 1 час

/**
 * POST /api/tg-cron/homework-cleanup
 *
 * Чистит submissions, у которых анализ Джарвикса висит дольше часа без
 * результата (aiAnalysisStartedAt set, нет aiAnalyzedAt и нет aiAnalysisError).
 * Такое бывает если AI-checker упал и callback не дошёл — без cleanup
 * куратор видит вечный «анализируется» и не может перезапустить.
 *
 * Помечаем aiAnalysisError, после чего фронт показывает кнопку перезапуска
 * и guard в /api/curator/homework/[id]/ai-analyze пропускает повторную
 * попытку.
 *
 * Запускать раз в 10-15 минут.
 */
export async function POST(req: NextRequest) {
  const secret =
    req.headers.get("x-cron-secret") ||
    req.nextUrl.searchParams.get("secret") ||
    "";
  if (CRON_SECRET && secret !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - STALE_ANALYSIS_MS);

  // Атомарно обновляем все подходящие записи одним запросом — никто
  // больше их одновременно не тронет, потому что условие в where фильтрует
  // именно «зависшие».
  const result = await db.homeworkSubmission.updateMany({
    where: {
      aiAnalysisStartedAt: { lt: cutoff, not: null },
      aiAnalyzedAt: null,
      aiAnalysisError: null,
    } as any,
    data: {
      aiAnalysisError:
        "AI-checker не ответил за час. Возможно сервис временно недоступен — можно перезапустить анализ.",
    } as any,
  });

  return NextResponse.json({
    ok: true,
    markedStale: result.count,
  });
}
