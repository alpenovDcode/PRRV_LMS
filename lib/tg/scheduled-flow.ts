// Scheduled-flow worker. Запускается из cron tick’а.
//
// Логика:
//   1. Пикаем due-записи (status=scheduled, scheduledAt <= now()),
//      атомарно переводим в running, чтобы не дублировать в гонках.
//   2. Для каждой записи строим аудиторию по filter, вызываем
//      startFlowRun для каждого подписчика (защищаемся try/catch — один
//      упавший подписчик не должен валить весь schedule).
//   3. В конце переводим в completed (или failed, если упало
//      материализование).

import { db } from "../db";
import { startFlowRun } from "./flow-engine";
import { trackEvent } from "./events";
import type { Prisma } from "@prisma/client";

interface ScheduleFilter {
  allActive?: boolean;
  tagsAny?: string[];
  tagsAll?: string[];
  excludeTags?: string[];
  subscriberIds?: string[];
}

function buildWhere(
  botId: string,
  filter: ScheduleFilter
): Prisma.TgSubscriberWhereInput {
  const where: Prisma.TgSubscriberWhereInput = { botId, isBlocked: false };
  if (filter.subscriberIds && filter.subscriberIds.length > 0) {
    where.id = { in: filter.subscriberIds };
    return where;
  }
  if (filter.tagsAny && filter.tagsAny.length > 0) {
    where.tags = { hasSome: filter.tagsAny };
  }
  if (filter.tagsAll && filter.tagsAll.length > 0) {
    where.tags = { ...(where.tags as object), hasEvery: filter.tagsAll };
  }
  if (filter.excludeTags && filter.excludeTags.length > 0) {
    where.NOT = { tags: { hasSome: filter.excludeTags } };
  }
  return where;
}

export async function processScheduledFlows(): Promise<{
  processed: number;
  launched: number;
  failed: number;
}> {
  // Pick up to 5 due schedules per tick — не хотим монополизировать
  // воркер при большом всплеске.
  const due = await db.tgScheduledFlow.findMany({
    where: {
      status: "scheduled",
      scheduledAt: { lte: new Date() },
    },
    orderBy: { scheduledAt: "asc" },
    take: 5,
  });

  if (due.length === 0) return { processed: 0, launched: 0, failed: 0 };

  let totalLaunched = 0;
  let totalFailed = 0;

  for (const sched of due) {
    // Optimistic claim: переводим в running только если ещё scheduled.
    const claimed = await db.tgScheduledFlow.updateMany({
      where: { id: sched.id, status: "scheduled" },
      data: { status: "running", startedAt: new Date() },
    });
    if (claimed.count === 0) continue;

    try {
      // Проверяем флоу — если он удалён или неактивен, помечаем failed.
      const flow = await db.tgFlow.findUnique({
        where: { id: sched.flowId },
        select: { id: true, isActive: true, botId: true },
      });
      if (!flow || flow.botId !== sched.botId) {
        await db.tgScheduledFlow.update({
          where: { id: sched.id },
          data: {
            status: "failed",
            finishedAt: new Date(),
            lastError: "flow not found or moved",
          },
        });
        continue;
      }
      if (!flow.isActive) {
        await db.tgScheduledFlow.update({
          where: { id: sched.id },
          data: {
            status: "failed",
            finishedAt: new Date(),
            lastError: "flow is inactive",
          },
        });
        continue;
      }

      const where = buildWhere(sched.botId, (sched.filter ?? {}) as ScheduleFilter);
      const subscribers = await db.tgSubscriber.findMany({
        where,
        select: { id: true },
      });

      let launched = 0;
      let failed = 0;
      // Идём по 50 одновременно — телеграм лимит ~30 msg/sec на бот,
      // но startFlowRun сам не шлёт сообщения (это делает движок), так
      // что параллелизм здесь безопасен. Эффект throttle — на стороне
      // tickRun.
      const BATCH = 50;
      for (let i = 0; i < subscribers.length; i += BATCH) {
        const slice = subscribers.slice(i, i + BATCH);
        await Promise.all(
          slice.map(async (s) => {
            try {
              await startFlowRun({
                flowId: sched.flowId,
                subscriberId: s.id,
                triggerInfo: {
                  triggerType: "scheduled_flow",
                  scheduledFlowId: sched.id,
                  scheduledAt: sched.scheduledAt.toISOString(),
                },
              });
              launched++;
            } catch (e) {
              failed++;
              console.warn(
                `[scheduled-flow ${sched.id}] startFlowRun failed for ${s.id}:`,
                e
              );
            }
          })
        );
      }

      await db.tgScheduledFlow.update({
        where: { id: sched.id },
        data: {
          status: "completed",
          finishedAt: new Date(),
          totalLaunched: launched,
          totalFailed: failed,
        },
      });

      trackEvent({
        type: "scheduled_flow.completed",
        botId: sched.botId,
        properties: {
          scheduledFlowId: sched.id,
          flowId: sched.flowId,
          launched,
          failed,
        },
      }).catch(() => {});

      totalLaunched += launched;
      totalFailed += failed;
    } catch (e) {
      await db.tgScheduledFlow.update({
        where: { id: sched.id },
        data: {
          status: "failed",
          finishedAt: new Date(),
          lastError: String(e),
        },
      });
      console.error(`[scheduled-flow ${sched.id}] fatal:`, e);
    }
  }

  return { processed: due.length, launched: totalLaunched, failed: totalFailed };
}
