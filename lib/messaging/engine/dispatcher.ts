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
  /**
   * Для типа keyword_comment — ID самого комментария. Нужен, чтобы первое
   * сообщение комментатору ушло как private reply (открывает DM-тред с тем,
   * кто ни разу не писал боту).
   */
  commentId?: string;
}

export async function dispatchInbound(input: DispatchInput): Promise<{
  resumed: boolean;
  triggeredFlowId: string | null;
  takeover?: boolean;
}> {
  const pfx = `[dispatcher][sub:${input.subscriberId.slice(-6)}]`;

  // ── 0. Operator takeover guard ──────────────────────────────────────────
  const subscriber = await db.messagingSubscriber.findUnique({
    where: { id: input.subscriberId },
    select: { operatorTakeoverAt: true } as any,
  });
  if ((subscriber as any)?.operatorTakeoverAt) {
    console.log(`${pfx} оператор взял диалог — воронки пропущены`);
    return { resumed: false, triggeredFlowId: null, takeover: true };
  }

  // ── 1. Resume активного wait_reply ──────────────────────────────────────
  if (input.triggerType === "keyword_dm") {
    const resumed = await resumeWithInput(input.subscriberId, {
      text: input.text,
      payload: input.payload,
    });
    if (resumed) {
      console.log(`${pfx} возобновлён активный wait_reply, текст="${input.text.slice(0, 50)}"`);
      return { resumed: true, triggeredFlowId: null };
    }
    console.log(`${pfx} активного wait_reply нет — ищем триггеры`);
  }

  // ── 2. Поиск триггеров ──────────────────────────────────────────────────
  const triggers = await db.messagingTrigger.findMany({
    where: {
      type: input.triggerType,
      flow: { botId: input.botId, isActive: true },
    },
    include: { flow: { select: { id: true, isActive: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });

  console.log(`${pfx} найдено триггеров типа "${input.triggerType}" для бота: ${triggers.length}`);

  if (triggers.length === 0) {
    console.warn(`${pfx} триггеров нет — создай воронку с триггером типа "${input.triggerType}" и активируй её`);
    return { resumed: false, triggeredFlowId: null };
  }

  for (const trigger of triggers) {
    const flowName = (trigger.flow as any).name ?? trigger.flow.id;

    // mediaIds-фильтр
    if (
      input.mediaId &&
      trigger.mediaIds.length > 0 &&
      !trigger.mediaIds.includes(input.mediaId)
    ) {
      console.log(`${pfx} триггер id=${trigger.id} (${flowName}): mediaId не совпал — пропуск`);
      continue;
    }

    const matched = matchesTrigger({
      text: input.text,
      keywords: trigger.keywords,
      matchType: trigger.matchType,
      caseSensitive: trigger.caseSensitive,
    });

    console.log(
      `${pfx} триггер id=${trigger.id} (${flowName}): ` +
      `keywords=${JSON.stringify(trigger.keywords)}, matchType=${trigger.matchType}, ` +
      `текст="${input.text.slice(0, 50)}" → ${matched ? "СОВПАЛО" : "не совпало"}`
    );

    if (!matched) continue;

    // ── 3. Стартуем flow ─────────────────────────────────────────────────
    console.log(`${pfx} запускаем воронку id=${trigger.flow.id} (${flowName})`);

    await db.messagingTrigger.update({
      where: { id: trigger.id },
      data: { triggerCount: { increment: 1 }, lastTriggeredAt: new Date() },
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
        // Для comment-входа: первое сообщение раннер отправит как private
        // reply по этому comment_id, затем удалит ключ из контекста.
        ...(input.commentId ? { _commentId: input.commentId } : {}),
      },
    });

    return { resumed: false, triggeredFlowId: trigger.flow.id };
  }

  console.warn(
    `${pfx} ни один триггер не совпал для текста="${input.text.slice(0, 80)}". ` +
    `Проверь keywords в триггерах воронок.`
  );
  return { resumed: false, triggeredFlowId: null };
}
