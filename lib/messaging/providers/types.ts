/**
 * lib/messaging/providers/types.ts
 *
 * Channel-agnostic интерфейс провайдера мессенджера.
 * Каждый канал (telegram, instagram, max) реализует этот интерфейс.
 *
 * Flow-engine оперирует BotProvider'ом — ему не важно, какой канал.
 */

import type { MessagingBot, MessagingSubscriber } from "@prisma/client";

export interface QuickReplyButton {
  /** Текст кнопки. Для IG ≤ 20 chars */
  title: string;
  /** Payload — что вернётся в webhook при нажатии */
  payload: string;
}

export interface SendMessageResult {
  /** ID отправленного сообщения на стороне платформы */
  externalMessageId: string;
}

export interface BotCapabilities {
  /** Поддержка inline-кнопок под сообщением (Telegram, МАКС). IG не поддерживает. */
  inlineButtons: boolean;
  /** Поддержка Quick Replies — кнопок под сообщением, исчезающих после клика (IG, FB). */
  quickReplies: boolean;
  /** Максимум quick replies в одном сообщении */
  maxQuickReplies: number;
  /** Поддержка медиа-групп (несколько фото/видео в одном «сообщении») */
  mediaGroups: boolean;
  /** Жёсткое 24h messaging window (Instagram, FB) */
  hasMessagingWindow: boolean;
  /** Поддержка триггеров на комментарии (Instagram) */
  commentTriggers: boolean;
  /** Поддержка триггеров на ответы в сторис (Instagram) */
  storyReplyTriggers: boolean;
}

export interface BotProvider {
  readonly channel: "telegram" | "instagram" | "max";
  readonly capabilities: BotCapabilities;

  /**
   * Отправить текстовое сообщение подписчику.
   */
  sendText(
    bot: MessagingBot,
    subscriber: MessagingSubscriber,
    text: string
  ): Promise<SendMessageResult>;

  /**
   * Отправить сообщение с quick replies.
   * Провайдеры без quick replies (если такие будут) могут эмулировать через
   * текст + inline-кнопки или просто игнорировать кнопки.
   */
  sendQuickReplies(
    bot: MessagingBot,
    subscriber: MessagingSubscriber,
    text: string,
    buttons: QuickReplyButton[]
  ): Promise<SendMessageResult>;

  /**
   * Может ли провайдер сейчас отправить сообщение подписчику?
   * Для IG проверяет 24h-window. Возвращает причину если нет.
   */
  canSendNow(subscriber: MessagingSubscriber): { allowed: boolean; reason?: string };
}
