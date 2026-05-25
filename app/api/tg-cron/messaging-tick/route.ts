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
    if (!node || node.type !== "wait_reply") {
      // битое состояние — завершаем
      await db.messagingFlowRun
        .update({
          where: { id: run.id },
          data: {
            status: MessagingFlowRunStatus.cancelled,
            completedAt: new Date(),
          },
        })
        .catch(() => {});
      completed++;
      continue;
    }

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

    // Переключаем на onTimeout-ветку и сразу даём cron-ом возможность продолжить.
    // Полноценный «tick» делаем динамическим импортом чтобы избежать
    // зацикленности с движком.
    await db.messagingFlowRun.update({
      where: { id: run.id },
      data: {
        status: MessagingFlowRunStatus.running,
        currentNodeId: onTimeout,
        waitUntil: null,
      },
    });

    try {
      await tickRun(run.id);
    } catch (e) {
      console.error("[messaging-tick] tick failed:", e);
    }
    advanced++;
  }

  return NextResponse.json({ ok: true, advanced, completed, total: stale.length });
}
