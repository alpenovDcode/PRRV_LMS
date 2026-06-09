// Cron tick endpoint. Drives the flow and broadcast workers.
//
// Authentication: bearer token in `Authorization: Bearer <TG_CRON_SECRET>`
// header. Set the secret in env; an external cron (Vercel Cron,
// docker-compose service, or plain shell `curl`) hits this URL on a
// schedule.
//
// Recommended cadence: every 15-30s for low latency on `delay` nodes,
// or every minute if you're OK with up-to-1-minute drift.

import { NextRequest, NextResponse } from "next/server";
import { processDueRuns } from "@/lib/tg/flow-engine";
import { processBroadcasts } from "@/lib/tg/broadcast";
import { processScheduledFlows } from "@/lib/tg/scheduled-flow";
import { processMessagingScheduledFlows } from "@/lib/messaging/scheduled-flow";
import { writeCronHeartbeat } from "@/lib/tg/cron-heartbeat";
import { timingSafeEqual } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function tokenMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
export async function GET(request: NextRequest) {
  return handle(request);
}

async function handle(request: NextRequest) {
  const expected = process.env.TG_CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "TG_CRON_SECRET not configured" },
      { status: 503 }
    );
  }
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : auth;
  if (!token || !tokenMatches(token, expected)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const start = Date.now();
  const runs = await processDueRuns().catch((e) => {
    console.error("[tg-cron] processDueRuns failed", e);
    return { processed: 0, error: String(e) };
  });
  const broadcasts = await processBroadcasts().catch((e) => {
    console.error("[tg-cron] processBroadcasts failed", e);
    return { processed: 0, error: String(e) };
  });
  const scheduledFlows = await processScheduledFlows().catch((e) => {
    console.error("[tg-cron] processScheduledFlows failed", e);
    return { processed: 0, error: String(e) };
  });
  // Тот же tick параллельно гоняет MAX/мессенджер расписания.
  // Не блокируем друг друга — каждый процессор делает свой take(5),
  // воркер ходит по обоим источникам последовательно.
  const messagingScheduledFlows = await processMessagingScheduledFlows().catch(
    (e) => {
      console.error("[tg-cron] processMessagingScheduledFlows failed", e);
      return { processed: 0, error: String(e) };
    }
  );
  const durationMs = Date.now() - start;
  // Heartbeat: пишем «я живой» в Redis, чтобы админка показала статус.
  // Любая ошибка тут не должна валить тик — heartbeat обнимает свои
  // catch’и сам, но на всякий случай ещё одно .catch() сверху.
  writeCronHeartbeat({
    at: Date.now(),
    runs: "processed" in runs ? runs.processed : 0,
    broadcasts: "processed" in broadcasts ? broadcasts.processed : 0,
    scheduledFlows:
      "processed" in scheduledFlows ? scheduledFlows.processed : 0,
    durationMs,
  }).catch(() => {});
  return NextResponse.json({
    ok: true,
    durationMs,
    runs,
    broadcasts,
    scheduledFlows,
    messagingScheduledFlows,
  });
}
