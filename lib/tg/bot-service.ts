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

/**
 * Подключение «как наблюдатель / форвард». Используется когда основной
 * webhook бота уже стоит на стороннем backend (например, prepodavai с
 * polling), а LMS только наблюдает за входящими апдейтами для аналитики,
 * подписчиков и Bitrix24-синка.
 *
 * Отличия от connectBot():
 *   • setWebhook НЕ вызывается — нельзя ломать polling/webhook на стороне
 *     внешнего бэка.
 *   • Возвращаем webhookSecret в открытом виде — админу нужно скопировать
 *     его в env внешнего бэка для подписи форвардов.
 *   • Помечаем connectionMode=forwarded — sender по этому флагу не шлёт
 *     исходящих, чтобы избежать дублей с внешним бэком.
 *
 * Внешний бэк должен POSTить каждый Telegram update на наш webhook URL с
 * заголовком X-Telegram-Bot-Api-Secret-Token == webhookSecret. Структура
 * тела — стандартный Telegram update, как Telegram сам бы прислал.
 */
export async function connectBotForwarded(
  input: ConnectBotInput
): Promise<ConnectBotResult & { webhookSecret?: string }> {
  const token = input.token.trim();
  if (!isValidTokenFormat(token)) {
    return { ok: false, error: "Invalid bot token format" };
  }
  const encrypted = encryptToken(token);
  const me = await tgGetMe(encrypted);
  if (!me.ok || !me.result) {
    return { ok: false, error: me.description || "Telegram getMe failed" };
  }

  const botUserId = String(me.result.id);
  const existing = await db.tgBot.findUnique({ where: { botUserId } });
  if (existing) {
    return { ok: false, error: "Bot already connected" };
  }

  const webhookSecret = generateWebhookSecret();
  const webhookUrl = buildWebhookUrl(""); // временный, перепишем после create

  const bot = await db.tgBot.create({
    data: {
      tokenEncrypted: encrypted,
      tokenPrefix: tokenPrefix(token),
      botUserId,
      username: me.result.username,
      title: input.title?.trim() || me.result.first_name,
      webhookSecret,
      // connectionMode форсим — sender по нему скипнет исходящие.
      connectionMode: "forwarded",
    } as any,
  });

  // Теперь, когда id известен, сохраняем webhookUrl чтобы UI мог его
  // показать админу для копирования в env внешнего бэка.
  const finalUrl = buildWebhookUrl(bot.id);
  await db.tgBot.update({
    where: { id: bot.id },
    data: { webhookUrl: finalUrl },
  });

  return {
    ok: true,
    bot: {
      id: bot.id,
      username: bot.username,
      title: bot.title,
      webhookUrl: finalUrl,
    },
    // ВНИМАНИЕ: webhookSecret возвращаем только ОДНИН раз — при подключении.
    // Дальше его можно только ротировать (rotate-webhook-secret endpoint).
    webhookSecret,
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

// Ротация токена бота. Используется когда BotFather выдал новый
// (после revoke) — мы валидируем его через getMe, требуем тот же id
// бота (нельзя «перецепить» админку на другого бота), сохраняем
// зашифрованную версию и переустанавливаем webhook с тем же
// webhookSecret (то есть TG-сторона тоже узнает новый токен).
export async function rotateToken(
  botId: string,
  newToken: string
): Promise<{ ok: boolean; error?: string }> {
  const bot = await db.tgBot.findUnique({ where: { id: botId } });
  if (!bot) return { ok: false, error: "Bot not found" };
  const token = newToken.trim();
  if (!isValidTokenFormat(token)) {
    return { ok: false, error: "Неверный формат токена" };
  }
  const newEncrypted = encryptToken(token);
  const me = await tgGetMe(newEncrypted);
  if (!me.ok || !me.result) {
    return {
      ok: false,
      error: me.description ?? "Telegram getMe не сработал на новом токене",
    };
  }
  if (String(me.result.id) !== bot.botUserId) {
    return {
      ok: false,
      error: `Новый токен принадлежит другому боту (@${me.result.username}). Менять токен можно только в пределах того же бота — это защита от случайной замены.`,
    };
  }
  // Сначала пробуем установить webhook на новом токене — если сломаемся,
  // не оставим БД с битым шифр-блобом.
  const webhookUrl = buildWebhookUrl(botId);
  const setRes = await tgSetWebhook(newEncrypted, webhookUrl, bot.webhookSecret);
  if (!setRes.ok) {
    return {
      ok: false,
      error: `setWebhook на новом токене не прошёл: ${setRes.description}`,
    };
  }
  await db.tgBot.update({
    where: { id: botId },
    data: {
      tokenEncrypted: newEncrypted,
      tokenPrefix: tokenPrefix(token),
      // username/title могли поменяться в Telegram — синхронизируем.
      username: me.result.username,
    },
  });
  return { ok: true };
}

// Ротация webhook secret. Generate fresh secret, setWebhook с ним, и
// только если Telegram принял — обновляем БД (старый секрет до этого
// момента ещё валиден, на случай если запрос упадёт в середине).
export async function rotateWebhookSecret(
  botId: string
): Promise<{ ok: boolean; error?: string }> {
  const bot = await db.tgBot.findUnique({ where: { id: botId } });
  if (!bot) return { ok: false, error: "Bot not found" };
  const newSecret = generateWebhookSecret();
  const webhookUrl = buildWebhookUrl(botId);
  const setRes = await tgSetWebhook(bot.tokenEncrypted, webhookUrl, newSecret);
  if (!setRes.ok) {
    return { ok: false, error: setRes.description ?? "setWebhook failed" };
  }
  await db.tgBot.update({
    where: { id: botId },
    data: { webhookSecret: newSecret },
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
