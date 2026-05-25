/**
 * lib/messaging/providers/factory.ts
 *
 * Фабрика провайдеров по каналу.
 */

import type { MessagingChannel } from "@prisma/client";
import { InstagramBotProvider } from "./instagram";
import type { BotProvider } from "./types";

const providers: Record<string, BotProvider> = {};

export function getBotProvider(channel: MessagingChannel): BotProvider {
  if (providers[channel]) return providers[channel];

  switch (channel) {
    case "instagram":
      providers[channel] = new InstagramBotProvider();
      break;
    case "telegram":
      // TODO: TelegramBotProvider — обёртка над lib/tg/. Этап 4 (миграция TG).
      throw new Error("Telegram provider not yet implemented in messaging layer");
    case "max":
      // TODO: MaxBotProvider. Этап 3.
      throw new Error("MAX provider not yet implemented");
    default:
      throw new Error(`Unknown channel: ${channel}`);
  }

  return providers[channel];
}
