/**
 * lib/messaging/events.ts
 *
 * Хелпер для записи событий в MessagingEvent. Типы — строки, фиксированный
 * список через константы (избегаем enum, чтобы добавление новых типов не
 * требовало миграции).
 *
 * Не падает на ошибке записи — события не должны ломать основной flow.
 */

import { db } from "@/lib/db";

export const EVENT_TYPES = {
  // Lifecycle подписчика
  SUBSCRIBER_CREATED: "subscriber.created",
  SUBSCRIBER_LMS_LINKED: "subscriber.lms_linked",

  // Flow lifecycle
  FLOW_STARTED: "flow.started",
  FLOW_COMPLETED: "flow.completed",
  FLOW_FAILED: "flow.failed",
  FLOW_CANCELLED: "flow.cancelled",

  // Триггеры
  TRIGGER_MATCHED: "trigger.matched",

  // Сообщения
  MESSAGE_INBOUND: "message.inbound",
  MESSAGE_OUTBOUND: "message.outbound",

  // Действия в воронках
  TAG_ADDED: "tag.added",
  TAG_REMOVED: "tag.removed",
  LIST_JOINED: "list.joined",
  LIST_LEFT: "list.left",

  // Рассылки
  BROADCAST_STARTED: "broadcast.started",
  BROADCAST_COMPLETED: "broadcast.completed",
  BROADCAST_DELIVERED: "broadcast.delivered",
  BROADCAST_FAILED: "broadcast.failed",

  // Операторы
  OPERATOR_TAKEOVER: "operator.takeover",
  OPERATOR_RELEASE: "operator.release",
  OPERATOR_REPLIED: "operator.replied",
} as const;

export interface RecordEventInput {
  botId: string;
  type: string;
  subscriberId?: string | null;
  data?: Record<string, unknown>;
}

export async function recordEvent(input: RecordEventInput): Promise<void> {
  try {
    await db.messagingEvent.create({
      data: {
        botId: input.botId,
        type: input.type,
        subscriberId: input.subscriberId ?? null,
        data: (input.data ?? null) as any,
      },
    });
  } catch (e) {
    console.warn("[events] record failed:", e);
  }
}
