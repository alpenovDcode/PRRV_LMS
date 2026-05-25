/**
 * lib/messaging/providers/instagram.ts
 *
 * BotProvider реализация для Instagram через Meta Graph API.
 * Обёртка над lib/messaging/instagram/api.ts.
 */

import type { MessagingBot, MessagingSubscriber } from "@prisma/client";
import { sendText as igSendText, sendQuickReplies as igSendQuickReplies, isWithin24hWindow } from "@/lib/messaging/instagram/api";
import { decrypt } from "@/lib/messaging/encryption";
import type { BotProvider, BotCapabilities, QuickReplyButton, SendMessageResult } from "./types";

const IG_CAPABILITIES: BotCapabilities = {
  inlineButtons: false,
  quickReplies: true,
  maxQuickReplies: 13,
  mediaGroups: false,
  hasMessagingWindow: true,
  commentTriggers: true,
  storyReplyTriggers: true,
};

export class InstagramBotProvider implements BotProvider {
  readonly channel = "instagram" as const;
  readonly capabilities = IG_CAPABILITIES;

  async sendText(
    bot: MessagingBot,
    subscriber: MessagingSubscriber,
    text: string
  ): Promise<SendMessageResult> {
    const check = this.canSendNow(subscriber);
    if (!check.allowed) {
      throw new Error(`IG: ${check.reason}`);
    }

    const result = await igSendText({
      accessToken: decrypt(bot.tokenEnc),
      fromAccountId: bot.externalAccountId,
      toIgsid: subscriber.externalUserId,
      text,
    });
    return { externalMessageId: result.message_id };
  }

  async sendQuickReplies(
    bot: MessagingBot,
    subscriber: MessagingSubscriber,
    text: string,
    buttons: QuickReplyButton[]
  ): Promise<SendMessageResult> {
    const check = this.canSendNow(subscriber);
    if (!check.allowed) {
      throw new Error(`IG: ${check.reason}`);
    }

    const result = await igSendQuickReplies({
      accessToken: decrypt(bot.tokenEnc),
      fromAccountId: bot.externalAccountId,
      toIgsid: subscriber.externalUserId,
      text,
      quickReplies: buttons.slice(0, this.capabilities.maxQuickReplies),
    });
    return { externalMessageId: result.message_id };
  }

  canSendNow(subscriber: MessagingSubscriber): { allowed: boolean; reason?: string } {
    if (!isWithin24hWindow(subscriber.lastInboundAt)) {
      return {
        allowed: false,
        reason: "24h messaging window expired — подписчик не писал более 24 часов",
      };
    }
    return { allowed: true };
  }
}
