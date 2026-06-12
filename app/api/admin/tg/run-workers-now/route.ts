/**
 * POST /api/admin/tg/run-workers-now
 *
 * Принудительно прокачивает воркеры: рассылки, scheduled-flows и
 * due-runs. Эквивалент одного тика cron, но с admin-авторизацией —
 * нужен когда внешний cron не настроен / отвалился, и хочется не
 * ждать «когда же оно само».
 *
 * Возвращает агрегаты: сколько рассылок/раннов обработано.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { processBroadcasts } from "@/lib/tg/broadcast";
import { processDueRuns } from "@/lib/tg/flow-engine";
import { processScheduledFlows } from "@/lib/tg/scheduled-flow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Длительный workload — увеличиваем максимальную длительность.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  return withAuth(
    req,
    async () => {
      const t0 = Date.now();
      const broadcasts = await processBroadcasts().catch((e) => {
        console.error("[run-workers-now] broadcasts failed", e);
        return { processed: 0 };
      });
      const runs = await processDueRuns().catch((e) => {
        console.error("[run-workers-now] runs failed", e);
        return { processed: 0 };
      });
      const scheduledFlows = await processScheduledFlows().catch((e) => {
        console.error("[run-workers-now] scheduled-flows failed", e);
        return { processed: 0 };
      });
      return NextResponse.json({
        success: true,
        data: {
          durationMs: Date.now() - t0,
          broadcasts,
          runs,
          scheduledFlows,
        },
      });
    },
    { roles: ["admin"] }
  );
}
