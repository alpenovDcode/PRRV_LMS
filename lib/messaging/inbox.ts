/**
 * lib/messaging/inbox.ts
 *
 * Запись сообщений в Inbox (MessagingMessage). Используется из:
 *   • Webhook handlers — сохраняют inbound (direction="in")
 *   • Engine после успешной отправки через provider — outbound (direction="out")
 *   • Manual reply из админки — outbound с source="operator:<userId>"
 */

import { db } from "@/lib/db";
import { recordEvent, EVENT_TYPES } from "./events";

export interface RecordInboundInput {
  botId: string;
  subscriberId: string;
  text?: string;
  callbackPayload?: string;
  externalMessageId?: string;
  attachments?: unknown;
}

export async function recordInboundMessage(input: RecordInboundInput): Promise<void> {
  await db.messagingMessage.create({
    data: {
      botId: input.botId,
      subscriberId: input.subscriberId,
      direction: "in",
      text: input.text ?? null,
      callbackPayload: input.callbackPayload ?? null,
      externalMessageId: input.externalMessageId ?? null,
      attachments: (input.attachments ?? null) as any,
    },
  });
  await recordEvent({
    botId: input.botId,
    type: EVENT_TYPES.MESSAGE_INBOUND,
    subscriberId: input.subscriberId,
    data: {
      hasText: !!input.text,
      hasCallback: !!input.callbackPayload,
    },
  });
}

export interface RecordOutboundInput {
  botId: string;
  subscriberId: string;
  text?: string;
  externalMessageId?: string;
  attachments?: unknown;
  /** Источник: "flow:<flowId>" | "broadcast:<id>" | "operator:<userId>" | "trigger" */
  source?: string;
}

export async function recordOutboundMessage(input: RecordOutboundInput): Promise<void> {
  await db.messagingMessage.create({
    data: {
      botId: input.botId,
      subscriberId: input.subscriberId,
      direction: "out",
      text: input.text ?? null,
      externalMessageId: input.externalMessageId ?? null,
      attachments: (input.attachments ?? null) as any,
      source: input.source ?? null,
    },
  });
  await recordEvent({
    botId: input.botId,
    type: EVENT_TYPES.MESSAGE_OUTBOUND,
    subscriberId: input.subscriberId,
    data: { source: input.source ?? null },
  });
}
