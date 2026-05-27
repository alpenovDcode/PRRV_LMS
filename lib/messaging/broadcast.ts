/**
 * lib/messaging/broadcast.ts
 *
 * Engine для массовых рассылок.
 *
 * Жизненный цикл:
 *   draft → scheduled (если есть scheduledAt) → sending → completed/failed
 *
 * Отправка происходит батчами по 50 чтобы не блокировать БД и не
 * упереться в rate-limits провайдера. Cron `/api/tg-cron/messaging-tick`
 * подбирает scheduled broadcasts с scheduledAt <= now и запускает.
 */

import { db } from "@/lib/db";
import {
  MessagingBroadcastStatus,
  type MessagingBot,
  type MessagingSubscriber,
} from "@prisma/client";
import { getBotProvider } from "./providers/factory";
import { renderTemplate } from "./engine/template";
import { recordEvent, EVENT_TYPES } from "./events";
import { recordOutboundMessage } from "./inbox";

const BATCH_SIZE = 50;

/**
 * Резолвит фильтр broadcast'а в список подписчиков.
 *
 * filter = {
 *   tags?: string[],           // только с этими тегами
 *   excludeTags?: string[],    // без этих тегов
 *   lists?: string[],          // только в этих листах
 *   excludeLists?: string[],   // не в этих листах
 *   anyOrAll?: "any"|"all"     // для tags
 * }
 */
export async function resolveBroadcastAudience(
  botId: string,
  filter: any
): Promise<string[]> {
  const tags: string[] = filter?.tags ?? [];
  const excludeTags: string[] = filter?.excludeTags ?? [];
  const lists: string[] = filter?.lists ?? [];
  const excludeLists: string[] = filter?.excludeLists ?? [];
  const anyOrAll: "any" | "all" = filter?.anyOrAll ?? "all";

  // Базовый набор — все подписчики бота
  let subscribers = await db.messagingSubscriber.findMany({
    where: { botId },
    select: { id: true, tags: true },
  });

  // Tag-фильтрация
  if (tags.length > 0) {
    subscribers = subscribers.filter((s) => {
      if (anyOrAll === "any") return tags.some((t) => s.tags.includes(t));
      return tags.every((t) => s.tags.includes(t));
    });
  }
  if (excludeTags.length > 0) {
    subscribers = subscribers.filter((s) => !excludeTags.some((t) => s.tags.includes(t)));
  }

  // List-фильтрация
  if (lists.length > 0) {
    const inLists = await db.messagingListMember.findMany({
      where: { listId: { in: lists } },
      select: { subscriberId: true },
    });
    const inListIds = new Set(inLists.map((m) => m.subscriberId));
    subscribers = subscribers.filter((s) => inListIds.has(s.id));
  }
  if (excludeLists.length > 0) {
    const excluded = await db.messagingListMember.findMany({
      where: { listId: { in: excludeLists } },
      select: { subscriberId: true },
    });
    const excludedIds = new Set(excluded.map((m) => m.subscriberId));
    subscribers = subscribers.filter((s) => !excludedIds.has(s.id));
  }

  return subscribers.map((s) => s.id);
}

/**
 * Создаёт MessagingBroadcastRecipient записи для всех подписчиков
 * из фильтра. Идемпотентно (skipDuplicates).
 */
export async function prepareBroadcastRecipients(broadcastId: string): Promise<number> {
  const broadcast = await db.messagingBroadcast.findUnique({
    where: { id: broadcastId },
    select: { botId: true, filter: true },
  });
  if (!broadcast) throw new Error("Broadcast not found");

  const audience = await resolveBroadcastAudience(broadcast.botId, broadcast.filter);

  if (audience.length > 0) {
    await db.messagingBroadcastRecipient.createMany({
      data: audience.map((sid) => ({
        broadcastId,
        subscriberId: sid,
        status: "pending",
      })),
      skipDuplicates: true,
    });
  }

  await db.messagingBroadcast.update({
    where: { id: broadcastId },
    data: { totalRecipients: audience.length },
  });

  return audience.length;
}

/**
 * Стартует отправку broadcast'а. Переводит статус в "sending",
 * отправляет батчами по 50, обновляет метрики.
 *
 * Идемпотентно через статус: повторный вызов на уже completed
 * broadcast не делает ничего.
 */
export async function sendBroadcast(broadcastId: string): Promise<{
  sent: number;
  failed: number;
  total: number;
}> {
  // Атомарный lock: только draft/scheduled → sending
  const lockResult = await db.messagingBroadcast.updateMany({
    where: {
      id: broadcastId,
      status: { in: [MessagingBroadcastStatus.draft, MessagingBroadcastStatus.scheduled] },
    },
    data: {
      status: MessagingBroadcastStatus.sending,
      startedAt: new Date(),
    },
  });
  if (lockResult.count === 0) {
    // Уже отправляется или completed — ничего не делаем
    const cur = await db.messagingBroadcast.findUnique({
      where: { id: broadcastId },
      select: { sentCount: true, failedCount: true, totalRecipients: true },
    });
    return {
      sent: cur?.sentCount ?? 0,
      failed: cur?.failedCount ?? 0,
      total: cur?.totalRecipients ?? 0,
    };
  }

  // Готовим recipients если ещё нет
  const existingCount = await db.messagingBroadcastRecipient.count({
    where: { broadcastId },
  });
  if (existingCount === 0) {
    await prepareBroadcastRecipients(broadcastId);
  }

  const broadcast = await db.messagingBroadcast.findUnique({
    where: { id: broadcastId },
    include: { bot: true },
  });
  if (!broadcast) throw new Error("Broadcast not found");

  await recordEvent({
    botId: broadcast.botId,
    type: EVENT_TYPES.BROADCAST_STARTED,
    data: { broadcastId, total: broadcast.totalRecipients },
  });

  let sent = 0;
  let failed = 0;

  // Отправляем батчами
  while (true) {
    const batch = await db.messagingBroadcastRecipient.findMany({
      where: { broadcastId, status: "pending" },
      take: BATCH_SIZE,
      include: { subscriber: true },
    });
    if (batch.length === 0) break;

    for (const recipient of batch) {
      try {
        await sendOneMessage(broadcast.bot, recipient.subscriber, broadcast, broadcastId);
        await db.messagingBroadcastRecipient.update({
          where: { id: recipient.id },
          data: { status: "sent", sentAt: new Date() },
        });
        await recordEvent({
          botId: broadcast.botId,
          type: EVENT_TYPES.BROADCAST_DELIVERED,
          subscriberId: recipient.subscriberId,
          data: { broadcastId },
        });
        sent++;
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        await db.messagingBroadcastRecipient.update({
          where: { id: recipient.id },
          data: { status: "failed", error: errMsg.slice(0, 500) },
        });
        await recordEvent({
          botId: broadcast.botId,
          type: EVENT_TYPES.BROADCAST_FAILED,
          subscriberId: recipient.subscriberId,
          data: { broadcastId, error: errMsg.slice(0, 200) },
        });
        failed++;
      }
    }

    // Обновляем счётчики в broadcast (для прогресса в UI)
    await db.messagingBroadcast.update({
      where: { id: broadcastId },
      data: { sentCount: { increment: sent }, failedCount: { increment: failed } },
    });
    sent = 0;
    failed = 0;
  }

  // Финализируем
  const final = await db.messagingBroadcast.findUnique({
    where: { id: broadcastId },
    select: { sentCount: true, failedCount: true, totalRecipients: true },
  });

  await db.messagingBroadcast.update({
    where: { id: broadcastId },
    data: {
      status: MessagingBroadcastStatus.completed,
      completedAt: new Date(),
    },
  });

  await recordEvent({
    botId: broadcast.botId,
    type: EVENT_TYPES.BROADCAST_COMPLETED,
    data: {
      broadcastId,
      sent: final?.sentCount ?? 0,
      failed: final?.failedCount ?? 0,
      total: final?.totalRecipients ?? 0,
    },
  });

  return {
    sent: final?.sentCount ?? 0,
    failed: final?.failedCount ?? 0,
    total: final?.totalRecipients ?? 0,
  };
}

async function sendOneMessage(
  bot: MessagingBot,
  subscriber: MessagingSubscriber,
  broadcast: { text: string; buttons: any },
  broadcastId: string
): Promise<void> {
  const provider = getBotProvider(bot.channel);
  const tmplCtx = { subscriber, bot, context: {} };
  const text = renderTemplate(broadcast.text, tmplCtx);

  // Если есть кнопки → используем sendButtons, иначе sendText
  if (Array.isArray(broadcast.buttons) && broadcast.buttons.length > 0) {
    const rendered = broadcast.buttons.map((b: any) =>
      b.type === "url"
        ? { type: "url" as const, title: renderTemplate(b.title, tmplCtx), url: renderTemplate(b.url, tmplCtx) }
        : { type: "postback" as const, title: renderTemplate(b.title, tmplCtx), payload: b.payload }
    );
    const sent = await provider.sendButtons(bot, subscriber, text, rendered);
    await recordOutboundMessage({
      botId: bot.id,
      subscriberId: subscriber.id,
      text,
      externalMessageId: sent.externalMessageId,
      source: "broadcast",
      attachments: { broadcastId, buttons: rendered },
    }).catch(() => {});
  } else {
    const sent = await provider.sendText(bot, subscriber, text);
    await recordOutboundMessage({
      botId: bot.id,
      subscriberId: subscriber.id,
      text,
      externalMessageId: sent.externalMessageId,
      source: "broadcast",
      attachments: { broadcastId },
    }).catch(() => {});
  }
}
