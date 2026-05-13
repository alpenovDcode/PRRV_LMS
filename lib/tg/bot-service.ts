// High-level bot lifecycle helpers used by the admin API.
// Keeps route handlers small and easy to test.

import { db } from "../db";
import {
  encryptToken,
  decryptToken,
  generateWebhookSecret,
  isValidTokenFormat,
  tokenPrefix,
} from "./crypto";
import {
  tgGetMe,
  tgSetWebhook,
  tgDeleteWebhook,
  tgGetWebhookInfo,
} from "./api";

function getPublicBaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL;
  if (!url) throw new Error("NEXT_PUBLIC_APP_URL must be set to register a Telegram webhook");
  return url.replace(/\/+$/, "");
}

export function buildWebhookUrl(botId: string): string {
  return `${getPublicBaseUrl()}/api/tg-webhook/${botId}`;
}

export interface ConnectBotInput {
  token: string;
  title?: string;
}

export interface ConnectBotResult {
  ok: boolean;
  error?: string;
  bot?: { id: string; username: string; title: string; webhookUrl: string };
}

export async function connectBot(input: ConnectBotInput): Promise<ConnectBotResult> {
  const token = input.token.trim();
  if (!isValidTokenFormat(token)) {
    return { ok: false, error: "Invalid bot token format" };
  }
  const encrypted = encryptToken(token);
  const me = await tgGetMe(encrypted);
  if (!me.ok || !me.result) {
    return { ok: false, error: me.description || "Telegram getMe failed" };
  }

  // Make sure this exact Telegram bot isn't already connected.
  const botUserId = String(me.result.id);
  const existing = await db.tgBot.findUnique({ where: { botUserId } });
  if (existing) {
    return { ok: false, error: "Bot already connected" };
  }

  const webhookSecret = generateWebhookSecret();
  const bot = await db.tgBot.create({
    data: {
      tokenEncrypted: encrypted,
      tokenPrefix: tokenPrefix(token),
      botUserId,
      username: me.result.username,
      title: input.title?.trim() || me.result.first_name,
      webhookSecret,
    },
  });

  const webhookUrl = buildWebhookUrl(bot.id);
  const setRes = await tgSetWebhook(encrypted, webhookUrl, webhookSecret);
  if (!setRes.ok) {
    // Rollback DB row — we don't want a bot present without an active webhook.
    await db.tgBot.delete({ where: { id: bot.id } }).catch(() => undefined);
    return { ok: false, error: `setWebhook failed: ${setRes.description}` };
  }

  await db.tgBot.update({
    where: { id: bot.id },
    data: { webhookUrl },
  });

  return {
    ok: true,
    bot: { id: bot.id, username: bot.username, title: bot.title, webhookUrl },
  };
}

export async function deleteBot(botId: string): Promise<{ ok: boolean; error?: string }> {
  const bot = await db.tgBot.findUnique({ where: { id: botId } });
  if (!bot) return { ok: true };
  // Best-effort: drop the webhook on Telegram's side first.
  await tgDeleteWebhook(bot.tokenEncrypted).catch(() => undefined);
  await db.tgBot.delete({ where: { id: bot.id } });
  return { ok: true };
}

export async function refreshWebhook(botId: string): Promise<{ ok: boolean; error?: string }> {
  const bot = await db.tgBot.findUnique({ where: { id: botId } });
  if (!bot) return { ok: false, error: "Bot not found" };
  const webhookUrl = buildWebhookUrl(bot.id);
  const r = await tgSetWebhook(bot.tokenEncrypted, webhookUrl, bot.webhookSecret);
  if (!r.ok) return { ok: false, error: r.description };
  await db.tgBot.update({
    where: { id: botId },
    data: { webhookUrl, isActive: true },
  });
  return { ok: true };
}

export async function getWebhookInfo(botId: string) {
  const bot = await db.tgBot.findUnique({ where: { id: botId } });
  if (!bot) return { ok: false, error: "Bot not found" } as const;
  const r = await tgGetWebhookInfo(bot.tokenEncrypted);
  return { ok: r.ok, info: r.result, error: r.description } as const;
}

// Token round-trip self-test. Useful during incident response, not
// exposed via API — kept here so it's discoverable next to the rest.
export async function selfTestEncryption(): Promise<boolean> {
  const sample = "12345678:" + "A".repeat(35);
  try {
    return decryptToken(encryptToken(sample)) === sample;
  } catch {
    return false;
  }
}
