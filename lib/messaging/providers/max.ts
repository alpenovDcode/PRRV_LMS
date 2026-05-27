/**
 * lib/messaging/providers/max.ts
 *
 * BotProvider реализация для MAX Bot API.
 */

import type { MessagingBot, MessagingSubscriber } from "@prisma/client";
import { sendMessage, type MaxButton } from "@/lib/messaging/max/api";
import { decrypt } from "@/lib/messaging/encryption";
import type {
  BotProvider,
  BotCapabilities,
  QuickReplyButton,
  TemplateButton,
  SendMessageResult,
} from "./types";

const MAX_CAPABILITIES: BotCapabilities = {
  // MAX поддерживает inline-кнопки нативно (callback + link)
  inlineButtons: true,
  // Quick replies эмулируются через ту же inline-клавиатуру
  quickReplies: true,
  maxQuickReplies: 100, // нет жёсткого лимита; на ряд до ~8, рядов много
  mediaGroups: false,
  // Нет 24-часового окна как у Instagram — бот может слать в любое время
  hasMessagingWindow: false,
  // Триггеров на комментарии/сторис в MAX нет
  commentTriggers: false,
  storyReplyTriggers: false,
  urlButtons: true,
  maxTemplateButtons: 100,
};

export class MaxBotProvider implements BotProvider {
  readonly channel = "max" as const;
  readonly capabilities = MAX_CAPABILITIES;

  async sendText(
    bot: MessagingBot,
    subscriber: MessagingSubscriber,
    text: string
  ): Promise<SendMessageResult> {
    const token = decrypt(bot.tokenEnc);
    const chatId = Number(subscriber.externalUserId);
    if (!Number.isFinite(chatId)) {
      throw new Error(`MAX: invalid chatId ${subscriber.externalUserId}`);
    }
    const result = await sendMessage(token, { chatId, text });
    return { externalMessageId: result.message_id };
  }

  async sendQuickReplies(
    bot: MessagingBot,
    subscriber: MessagingSubscriber,
    text: string,
    buttons: QuickReplyButton[]
  ): Promise<SendMessageResult> {
    const token = decrypt(bot.tokenEnc);
    const chatId = Number(subscriber.externalUserId);
    if (!Number.isFinite(chatId)) {
      throw new Error(`MAX: invalid chatId ${subscriber.externalUserId}`);
    }

    // Все кнопки callback-типа. Раскладываем по 2 в ряд для компактности.
    const buttonsAsCallback: MaxButton[] = buttons.map((b) => ({
      type: "callback",
      text: b.title,
      payload: b.payload,
    }));
    const rows = chunk(buttonsAsCallback, 2);

    const result = await sendMessage(token, {
      chatId,
      text,
      attachments: [{ type: "inline_keyboard", payload: { buttons: rows } }],
    });
    return { externalMessageId: result.message_id };
  }

  async sendButtons(
    bot: MessagingBot,
    subscriber: MessagingSubscriber,
    text: string,
    buttons: TemplateButton[]
  ): Promise<SendMessageResult> {
    const token = decrypt(bot.tokenEnc);
    const chatId = Number(subscriber.externalUserId);
    if (!Number.isFinite(chatId)) {
      throw new Error(`MAX: invalid chatId ${subscriber.externalUserId}`);
    }

    const maxButtons: MaxButton[] = buttons.map((b) =>
      b.type === "url"
        ? { type: "link" as const, text: b.title, url: b.url }
        : { type: "callback" as const, text: b.title, payload: b.payload }
    );
    // Каждую URL/postback-кнопку — в свой ряд (выглядит как «карточный» layout)
    const rows = maxButtons.map((b) => [b]);

    const result = await sendMessage(token, {
      chatId,
      text,
      attachments: [{ type: "inline_keyboard", payload: { buttons: rows } }],
    });
    return { externalMessageId: result.message_id };
  }

  canSendNow(_subscriber: MessagingSubscriber): { allowed: boolean; reason?: string } {
    // У MAX нет 24h-окна
    return { allowed: true };
  }
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
