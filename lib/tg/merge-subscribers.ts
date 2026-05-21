// Слияние подписчиков. Объединяет несколько записей TgSubscriber в одну
// «главную». Полезно когда:
//   • пользователь имеет 2 tg-аккаунта и оба попали в базу
//   • после CSV-импорта появился дубль
//   • миграция из другой платформы создала разрозненные записи
//
// Алгоритм:
//   1. Все FK-таблицы (messages, flow_runs, events, broadcast_recipients,
//      subscriber_lists, redirect_clicks) переводим с secondary на primary.
//      Для таблиц с unique-констрейнтом на (foo, subscriberId) предварительно
//      удаляем строки-конфликты у secondary (т.е. там, где primary уже
//      имеет запись с тем же foo).
//   2. Сливаем теги (union) и customFields/variables (новое поверх старого).
//   3. Удаляем secondary.
//
// Возвращаем сводку: что-куда-сколько перевели + ошибки (если были).

import { db } from "../db";
import type { Prisma } from "@prisma/client";

export interface MergeResult {
  primaryId: string;
  secondaryIds: string[];
  reassigned: {
    messages: number;
    flowRuns: number;
    events: number;
    broadcastRecipients: number;
    subscriberLists: number;
    redirectLinks: number;
  };
  mergedTags: string[];
  mergedCustomFieldsKeys: string[];
  errors: string[];
}

function mergeJsonRecord(
  base: Prisma.JsonValue,
  patch: Prisma.JsonValue
): Record<string, unknown> {
  const a = (base && typeof base === "object" && !Array.isArray(base)
    ? base
    : {}) as Record<string, unknown>;
  const b = (patch && typeof patch === "object" && !Array.isArray(patch)
    ? patch
    : {}) as Record<string, unknown>;
  return { ...a, ...b };
}

export async function mergeSubscribers(args: {
  botId: string;
  primaryId: string;
  secondaryIds: string[];
}): Promise<MergeResult> {
  const { botId, primaryId, secondaryIds } = args;
  if (!primaryId) throw new Error("primaryId required");
  if (secondaryIds.length === 0) throw new Error("secondaryIds required");
  if (secondaryIds.includes(primaryId))
    throw new Error("primary cannot be in secondaryIds");

  const ids = [primaryId, ...secondaryIds];
  const subscribers = await db.tgSubscriber.findMany({
    where: { id: { in: ids }, botId },
  });
  const byId = new Map(subscribers.map((s) => [s.id, s]));
  const primary = byId.get(primaryId);
  if (!primary) throw new Error("primary not found");
  for (const sid of secondaryIds) {
    if (!byId.get(sid))
      throw new Error(`secondary ${sid} not found in bot ${botId}`);
  }

  const result: MergeResult = {
    primaryId,
    secondaryIds,
    reassigned: {
      messages: 0,
      flowRuns: 0,
      events: 0,
      broadcastRecipients: 0,
      subscriberLists: 0,
      redirectLinks: 0,
    },
    mergedTags: [],
    mergedCustomFieldsKeys: [],
    errors: [],
  };

  await db.$transaction(
    async (tx) => {
      // --- broadcast_recipients: unique(broadcastId, subscriberId) -------
      // Найдём пары broadcastId, где primary уже принял рассылку — для
      // secondary такие строки удалим.
      const primaryBroadcasts = await tx.tgBroadcastRecipient.findMany({
        where: { subscriberId: primaryId },
        select: { broadcastId: true },
      });
      const primaryBroadcastIds = new Set(
        primaryBroadcasts.map((r) => r.broadcastId)
      );
      const conflictBR = await tx.tgBroadcastRecipient.deleteMany({
        where: {
          subscriberId: { in: secondaryIds },
          broadcastId: { in: Array.from(primaryBroadcastIds) },
        },
      });
      const remappedBR = await tx.tgBroadcastRecipient.updateMany({
        where: { subscriberId: { in: secondaryIds } },
        data: { subscriberId: primaryId },
      });
      result.reassigned.broadcastRecipients =
        remappedBR.count + conflictBR.count;

      // --- subscriber_lists: unique(listId, subscriberId) ---------------
      const primaryLists = await tx.tgSubscriberList.findMany({
        where: { subscriberId: primaryId },
        select: { listId: true },
      });
      const primaryListIds = new Set(primaryLists.map((r) => r.listId));
      const conflictLists = await tx.tgSubscriberList.deleteMany({
        where: {
          subscriberId: { in: secondaryIds },
          listId: { in: Array.from(primaryListIds) },
        },
      });
      const remappedLists = await tx.tgSubscriberList.updateMany({
        where: { subscriberId: { in: secondaryIds } },
        data: { subscriberId: primaryId },
      });
      result.reassigned.subscriberLists =
        remappedLists.count + conflictLists.count;

      // --- Без уникальных ключей: messages, flow_runs, events, redirect_clicks
      const remappedMsgs = await tx.tgMessage.updateMany({
        where: { subscriberId: { in: secondaryIds } },
        data: { subscriberId: primaryId },
      });
      result.reassigned.messages = remappedMsgs.count;

      const remappedRuns = await tx.tgFlowRun.updateMany({
        where: { subscriberId: { in: secondaryIds } },
        data: { subscriberId: primaryId },
      });
      result.reassigned.flowRuns = remappedRuns.count;

      const remappedEvents = await tx.tgEvent.updateMany({
        where: { subscriberId: { in: secondaryIds } },
        data: { subscriberId: primaryId },
      });
      result.reassigned.events = remappedEvents.count;

      const remappedRedirects = await tx.tgRedirectLink.updateMany({
        where: { subscriberId: { in: secondaryIds } },
        data: { subscriberId: primaryId },
      });
      result.reassigned.redirectLinks = remappedRedirects.count;

      // --- merge metadata onto primary ---------------------------------
      const mergedTags = new Set<string>(primary.tags);
      let mergedCustomFields: Record<string, unknown> = mergeJsonRecord(
        primary.customFields,
        {}
      );
      let mergedVariables: Record<string, unknown> = mergeJsonRecord(
        primary.variables,
        {}
      );
      let earliestSubscribedAt = primary.subscribedAt;
      let latestLastSeenAt: Date | null = primary.lastSeenAt;
      let firstTouchSlug = primary.firstTouchSlug;
      let firstTouchAt = primary.firstTouchAt;

      for (const sid of secondaryIds) {
        const s = byId.get(sid)!;
        for (const t of s.tags) mergedTags.add(t);
        mergedCustomFields = mergeJsonRecord(
          mergedCustomFields as Prisma.JsonValue,
          s.customFields
        );
        mergedVariables = mergeJsonRecord(
          mergedVariables as Prisma.JsonValue,
          s.variables
        );
        if (s.subscribedAt < earliestSubscribedAt) {
          earliestSubscribedAt = s.subscribedAt;
        }
        if (s.lastSeenAt && (!latestLastSeenAt || s.lastSeenAt > latestLastSeenAt)) {
          latestLastSeenAt = s.lastSeenAt;
        }
        // First-touch берём самый ранний (по дате).
        if (
          s.firstTouchAt &&
          (!firstTouchAt || s.firstTouchAt < firstTouchAt)
        ) {
          firstTouchAt = s.firstTouchAt;
          firstTouchSlug = s.firstTouchSlug ?? firstTouchSlug;
        }
      }

      result.mergedTags = Array.from(mergedTags);
      result.mergedCustomFieldsKeys = Object.keys(mergedCustomFields);

      await tx.tgSubscriber.update({
        where: { id: primaryId },
        data: {
          tags: { set: result.mergedTags },
          customFields: mergedCustomFields as Prisma.InputJsonValue,
          variables: mergedVariables as Prisma.InputJsonValue,
          subscribedAt: earliestSubscribedAt,
          lastSeenAt: latestLastSeenAt,
          firstTouchSlug,
          firstTouchAt,
        },
      });

      // --- delete secondaries ------------------------------------------
      await tx.tgSubscriber.deleteMany({
        where: { id: { in: secondaryIds }, botId },
      });
    },
    { timeout: 60_000 }
  );

  return result;
}
