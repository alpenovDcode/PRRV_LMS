/**
 * lib/messaging/engine/dispatcher.ts
 *
 * Маршрутизатор входящих сообщений в flow-engine.
 *
 * Алгоритм:
 *   1. Сначала пытаемся возобновить активный wait_reply (если есть).
 *      Если возобновился — на этом останавливаемся (один inbound = один эффект).
 *   2. Если активного wait нет — ищем триггеры с подходящим типом и keyword.
 *      Первый совпавший триггер запускает свой flow.
 *   3. Если ничего не совпало — просто логируем.
 */

import { db } from "@/lib/db";
import type { MessagingTriggerType } from "@prisma/client";
import { matchesTrigger } from "./trigger-matcher";
import { resumeWithInput, startFlow } from "./runner";
import { recordEvent, EVENT_TYPES } from "../events";

export interface DispatchInput {
  subscriberId: string;
  botId: string;
  /** Тип события — keyword_dm для обычного DM, и т.д. */
  triggerType: MessagingTriggerType;
  /** Текст сообщения (для матчинга keywords) */
  text: string;
  /** Payload от quick reply (если был клик) */
  payload?: string;
  /** Для типа keyword_comment — ID поста на стороне платформы */
  mediaId?: string;
}

export async function dispatchInbound(input: DispatchInput): Promise<{
  resumed: boolean;
  triggeredFlowId: string | null;
  takeover?: boolean;
}> {
  // ── 0. Operator takeover guard ──────────────────────────────────────────
  // Если оператор взял диалог под ручное управление — auto-triggers
  // и flow-engine отключены. Сообщение только сохранится в Inbox.
  const subscriber = await db.messagingSubscriber.findUnique({
    where: { id: input.subscriberId },
    select: { operatorTakeoverAt: true } as any,
  });
  if ((subscriber as any)?.operatorTakeoverAt) {
    return { resumed: false, triggeredFlowId: null, takeover: true };
  }

  // ── 1. Resume активного wait_reply ──────────────────────────────────────
  // (Только для DM-input — комментарии под постом не возобновляют DM-flow)
  if (input.triggerType === "keyword_dm") {
    const resumed = await resumeWithInput(input.subscriberId, {
      text: input.text,
      payload: input.payload,
    });
    if (resumed) {
      return { resumed: true, triggeredFlowId: null };
    }
  }

  // ── 2. Поиск триггеров ──────────────────────────────────────────────────
  const triggers = await db.messagingTrigger.findMany({
    where: {
      type: input.triggerType,
      flow: { botId: input.botId, isActive: true },
    },
    include: { flow: { select: { id: true, isActive: true } } },
    orderBy: { createdAt: "asc" }, // ранние триггеры выигрывают
  });

  for (const trigger of triggers) {
    // mediaIds-фильтр: пусто = на всех постах, иначе должен совпасть
    if (
      input.mediaId &&
      trigger.mediaIds.length > 0 &&
      !trigger.mediaIds.includes(input.mediaId)
    ) {
      continue;
    }

    const matched = matchesTrigger({
      text: input.text,
      keywords: trigger.keywords,
      matchType: trigger.matchType,
      caseSensitive: trigger.caseSensitive,
    });
    if (!matched) continue;

    // ── 3. Стартуем flow + обновим метрики триггера ──────────────────────
    await db.messagingTrigger.update({
      where: { id: trigger.id },
      data: {
        triggerCount: { increment: 1 },
        lastTriggeredAt: new Date(),
      },
    });

    await recordEvent({
      botId: input.botId,
      type: EVENT_TYPES.TRIGGER_MATCHED,
      subscriberId: input.subscriberId,
      data: {
        triggerId: trigger.id,
        triggerType: trigger.type,
        flowId: trigger.flow.id,
        keywords: trigger.keywords,
      },
    });

    await startFlow({
      flowId: trigger.flow.id,
      subscriberId: input.subscriberId,
      initialContext: {
        lastInput: input.text,
        lastPayload: input.payload ?? "",
        triggerType: trigger.type,
        triggerKeyword: trigger.keywords.join(",") || null,
      },
    });

    return { resumed: false, triggeredFlowId: trigger.flow.id };
  }

  return { resumed: false, triggeredFlowId: null };
}
