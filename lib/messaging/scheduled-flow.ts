/**
 * lib/messaging/scheduled-flow.ts
 *
 * Scheduled-flow worker для MAX/мессенджер-ботов. Параллель
 * lib/tg/scheduled-flow.ts. Запускается из общего cron tick.
 *
 * Логика:
 *   1. Пикаем due-записи (status=scheduled, scheduledAt <= now()).
 *   2. Атомарно переводим в running, чтобы исключить дубли при гонках
 *      нескольких воркеров.
 *   3. Для каждой записи строим аудиторию по filter, дёргаем `startFlow`
 *      на каждого подписчика (защищаемся try/catch — один упавший
 *      подписчик не должен валить весь schedule).
 *   4. В конце переводим в completed (или failed, если упало
 *      материализование аудитории / сам flow).
 *
 * За кадром — структура совпадает с TG один-в-один, разница только в
 * именах моделей и в том что у MessagingSubscriber нет isBlocked поля
 * (есть operatorTakeoverAt — это другой контекст).
 */

import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { startFlow } from "./engine/runner";
import { recordEvent } from "./events";

export interface ScheduleFilter {
  /** Включить всех активных подписчиков (приоритет ниже tags/ids). */
  allActive?: boolean;
  /** Хотя бы один из этих тегов. */
  tagsAny?: string[];
  /** Все из этих тегов (intersection). */
  tagsAll?: string[];
  /** Исключить, у кого есть хотя бы один из этих тегов. */
  excludeTags?: string[];
  /** Конкретный список id. Если задан — все остальные фильтры игнорируются. */
  subscriberIds?: string[];
}

function buildWhere(
  botId: string,
  filter: ScheduleFilter
): Prisma.MessagingSubscriberWhereInput {
  // У MessagingSubscriber нет isBlocked (в отличие от TgSubscriber) —
  // блокировка делается на уровне канала, нам тут не виднa. Просто
  // выбираем всех в боте под фильтр.
  const where: Prisma.MessagingSubscriberWhereInput = { botId };
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

export interface ProcessResult {
  processed: number;
  launched: number;
  failed: number;
}

export async function processMessagingScheduledFlows(): Promise<ProcessResult> {
  const due = await db.messagingScheduledFlow.findMany({
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
    // Optimistic claim — переводим в running только если ещё scheduled.
    // updateMany возвращает количество обновлённых, не объект, поэтому
    // race-friendly: параллельный воркер обновит count=0 и пройдёт мимо.
    const claimed = await db.messagingScheduledFlow.updateMany({
      where: { id: sched.id, status: "scheduled" },
      data: { status: "running", startedAt: new Date() },
    });
    if (claimed.count === 0) continue;

    try {
      // Проверяем flow — если он удалён или неактивен, помечаем failed.
      const flow = await db.messagingFlow.findUnique({
        where: { id: sched.flowId },
        select: { id: true, isActive: true, botId: true },
      });
      if (!flow || flow.botId !== sched.botId) {
        await db.messagingScheduledFlow.update({
          where: { id: sched.id },
          data: {
            status: "failed",
            finishedAt: new Date(),
            lastError: "flow not found or moved to another bot",
          },
        });
        continue;
      }
      if (!flow.isActive) {
        await db.messagingScheduledFlow.update({
          where: { id: sched.id },
          data: {
            status: "failed",
            finishedAt: new Date(),
            lastError: "flow is inactive",
          },
        });
        continue;
      }

      const where = buildWhere(
        sched.botId,
        (sched.filter ?? {}) as ScheduleFilter
      );
      const subscribers = await db.messagingSubscriber.findMany({
        where,
        select: { id: true },
      });

      let launched = 0;
      let failed = 0;
      // Идём по 50 одновременно. startFlow сам не шлёт сообщения (это
      // делает engine при tickRun), так что параллелизм здесь безопасен.
      // Throttle отправок — на стороне runner'а через provider.
      const BATCH = 50;
      for (let i = 0; i < subscribers.length; i += BATCH) {
        const slice = subscribers.slice(i, i + BATCH);
        await Promise.all(
          slice.map(async (s) => {
            try {
              await startFlow({
                flowId: sched.flowId,
                subscriberId: s.id,
                initialContext: {
                  scheduledFlowId: sched.id,
                  scheduledAt: sched.scheduledAt.toISOString(),
                  trigger: "scheduled_flow",
                },
              });
              launched++;
            } catch (e) {
              failed++;
              console.warn(
                `[messaging/scheduled-flow ${sched.id}] startFlow failed for sub=${s.id}:`,
                e
              );
            }
          })
        );
      }

      await db.messagingScheduledFlow.update({
        where: { id: sched.id },
        data: {
          status: "completed",
          finishedAt: new Date(),
          totalLaunched: launched,
          totalFailed: failed,
        },
      });

      recordEvent({
        type: "flow.started", // ближайший общий тип; конкретику кладём в data
        botId: sched.botId,
        data: {
          scheduledFlowId: sched.id,
          flowId: sched.flowId,
          launched,
          failed,
          source: "scheduled",
        },
      }).catch(() => {});

      totalLaunched += launched;
      totalFailed += failed;
    } catch (e) {
      await db.messagingScheduledFlow.update({
        where: { id: sched.id },
        data: {
          status: "failed",
          finishedAt: new Date(),
          lastError: e instanceof Error ? e.message : String(e),
        },
      });
    }
  }

  return {
    processed: due.length,
    launched: totalLaunched,
    failed: totalFailed,
  };
}
