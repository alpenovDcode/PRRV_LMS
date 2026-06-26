// Cron tick endpoint для маркетинговой email-очереди.
//
// Authentication: Bearer EMAIL_CRON_SECRET. Внешний sidecar (docker-compose
// сервис email-cron, описан в docs/MARKETING_EMAIL_SYSTEM.md §9) курлит
// этот endpoint каждые 10 секунд.
//
// Внутри запускает параллельно процессоры:
//  - processDueDeliveryJobs() — берёт N EmailDeliveryJob со status pending/retrying
//    и next_attempt_at <= NOW(), отправляет батч через провайдера, обновляет
//    статусы. Exponential backoff retry: +30s, +5m, +30m, +2h, потом failed.
//  - processDueAutomationRuns() — продвигает EmailAutomationRun на следующий
//    шаг по nextStepAt. Создаёт EmailDeliveryJob для шага.
//
// Обработчики пока пустые (Спринт 0). Реализуются в Спринте 4 и 6.

import { NextRequest, NextResponse } from "next/server";
import { compareConstantTime } from "@/lib/email/security/constant-time-compare";
import { processCampaigns } from "@/lib/email/queue/process-campaigns";
import { processDueAutomationRuns } from "@/lib/email/queue/process-automations";
import { processInactivityTriggers } from "@/lib/email/automations/inactivity-trigger";
import { processTokensGeneration } from "@/lib/email/queue/process-tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  return handle(request);
}
export async function GET(request: NextRequest) {
  return handle(request);
}

async function handle(request: NextRequest) {
  const expected = process.env.EMAIL_CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "EMAIL_CRON_SECRET not configured" },
      { status: 503 }
    );
  }

  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : auth;
  if (!compareConstantTime(token, expected)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const start = Date.now();

  // Фоновая генерация unsubscribeToken для запущенных кампаний. Раньше
  // делалось синхронно в /send — таймаут nginx на 70K-базе.
  const tokens = await processTokensGeneration().catch((e) => {
    console.error("[email-cron] processTokensGeneration failed:", e);
    return { error: String(e), processed: 0, campaignsCompleted: 0 };
  });

  // Спринт 4: процессор кампаний — scheduled → sending, enqueue, отправка батча, finish.
  const delivery = await processCampaigns().catch((e) => {
    console.error("[email-cron] processCampaigns failed:", e);
    return {
      error: String(e),
      scheduledStarted: 0,
      enqueuesRun: 0,
      jobsProcessed: 0,
      jobsSent: 0,
      jobsFailed: 0,
      campaignsFinished: 0,
      orphanReclaimed: 0,
    };
  });

  // Спринт 6: триггерные цепочки писем (welcome, реактивация и т.п.).
  const automations = await processDueAutomationRuns().catch((e) => {
    console.error("[email-cron] processDueAutomationRuns failed:", e);
    return {
      error: String(e),
      processed: 0,
      stepsSent: 0,
      cancelled: 0,
      completed: 0,
      failed: 0,
    };
  });

  // Inactivity-триггер запускается лениво — не на каждом тике, а раз в час.
  // Внутри функция сама решает, пора ли работать.
  const inactivity = await processInactivityTriggers().catch((e) => {
    console.error("[email-cron] processInactivityTriggers failed:", e);
    return { error: String(e), checked: 0, started: 0, skipped: true };
  });

  const durationMs = Date.now() - start;

  return NextResponse.json({
    ok: true,
    durationMs,
    tokens,
    delivery,
    automations,
    inactivity,
  });
}
