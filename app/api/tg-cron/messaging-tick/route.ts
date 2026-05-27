import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { MessagingFlowRunStatus } from "@prisma/client";
import { tickRun } from "@/lib/messaging/engine/runner";

const CRON_SECRET = process.env.TG_CRON_SECRET || "";

/**
 * POST /api/tg-cron/messaging-tick
 *
 * Будит flow-runs которые ждут ответа дольше указанного timeout (wait_reply
 * с истёкшим waitUntil). Переключает на onTimeout-ветку графа.
 *
 * Cron должен дёргать каждые 20-60 секунд (как и tg-cron/tick).
 */
export async function POST(req: NextRequest) {
  const secret =
    req.headers.get("x-cron-secret") ||
    req.nextUrl.searchParams.get("secret") ||
    "";
  if (CRON_SECRET && secret !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  // ── Находим истёкшие wait_reply ────────────────────────────────────────
  const stale = await db.messagingFlowRun.findMany({
    where: {
      status: MessagingFlowRunStatus.waiting_reply,
      waitUntil: { lte: now },
    },
    take: 50,
    include: { flow: true },
  });

  let advanced = 0;
  let completed = 0;

  for (const run of stale) {
    const graph = run.flow.graph as any;
    const node = graph?.nodes?.[run.currentNodeId ?? ""];

    // Два возможных сценария wake-up:
    //   1. wait_reply таймаут → переключаем на node.onTimeout (или completed)
    //   2. delay просыпается → currentNodeId уже указывает на следующий узел
    //      (это записал runner при kind:"sleep"). Здесь node.type будет любой
    //      кроме wait_reply — значит просто запускаем tickRun.

    if (node && node.type === "wait_reply") {
      const onTimeout = node.onTimeout as string | null;
      if (!onTimeout) {
        await db.messagingFlowRun.update({
          where: { id: run.id },
          data: {
            status: MessagingFlowRunStatus.completed,
            completedAt: new Date(),
            currentNodeId: null,
          },
        });
        completed++;
        continue;
      }
      await db.messagingFlowRun.update({
        where: { id: run.id },
        data: {
          status: MessagingFlowRunStatus.running,
          currentNodeId: onTimeout,
          waitUntil: null,
        },
      });
    } else if (node) {
      // Просыпание после delay-узла. currentNodeId уже указывает на цель —
      // просто переключаем статус и запускаем tick.
      await db.messagingFlowRun.update({
        where: { id: run.id },
        data: {
          status: MessagingFlowRunStatus.running,
          waitUntil: null,
        },
      });
    } else {
      // currentNodeId указывает на узел которого нет в графе — completed
      await db.messagingFlowRun.update({
        where: { id: run.id },
        data: {
          status: MessagingFlowRunStatus.completed,
          completedAt: new Date(),
          currentNodeId: null,
        },
      });
      completed++;
      continue;
    }

    try {
      await tickRun(run.id);
    } catch (e) {
      console.error("[messaging-tick] tick failed:", e);
    }
    advanced++;
  }

  // ── Запуск scheduled-broadcasts ────────────────────────────────────────
  // Берём те у которых scheduledAt <= now и переключаем на sending.
  let broadcastsStarted = 0;
  const scheduled = await db.messagingBroadcast.findMany({
    where: {
      status: "scheduled",
      scheduledAt: { lte: now, not: null },
    },
    take: 5,
    select: { id: true },
  });
  if (scheduled.length > 0) {
    const { sendBroadcast } = await import("@/lib/messaging/broadcast");
    for (const b of scheduled) {
      try {
        await sendBroadcast(b.id);
        broadcastsStarted++;
      } catch (e) {
        console.error(`[messaging-tick] broadcast ${b.id} send failed:`, e);
        await db.messagingBroadcast
          .update({
            where: { id: b.id },
            data: {
              status: "failed",
              lastError: e instanceof Error ? e.message.slice(0, 500) : String(e),
            },
          })
          .catch(() => {});
      }
    }
  }

  return NextResponse.json({
    ok: true,
    advanced,
    completed,
    total: stale.length,
    broadcastsStarted,
  });
}
