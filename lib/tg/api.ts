// Thin Telegram Bot API client. We deliberately do NOT pull in grammY:
// keeps the dep-set small and the surface explicit. Only the methods
// the bot platform actually uses live here.

import { decryptToken } from "./crypto";

const TELEGRAM_API = "https://api.telegram.org";

export interface InlineKeyboardButton {
  text: string;
  // exactly one of: url | callback_data | switch_inline_query
  url?: string;
  callback_data?: string;
  switch_inline_query?: string;
}

export type InlineKeyboard = InlineKeyboardButton[][];

export interface SendMessageOptions {
  parse_mode?: "HTML" | "MarkdownV2";
  disable_web_page_preview?: boolean;
  reply_markup?: { inline_keyboard: InlineKeyboard };
  reply_to_message_id?: number;
}

export interface SendPhotoOptions extends SendMessageOptions {
  caption?: string;
}

export interface TgApiResult<T = unknown> {
  ok: boolean;
  result?: T;
  error_code?: number;
  description?: string;
  parameters?: { retry_after?: number; migrate_to_chat_id?: number };
}

export interface TgMessageResult {
  message_id: number;
  chat: { id: number; type: string };
  date: number;
}

async function callApi<T>(
  encryptedToken: string,
  method: string,
  body: Record<string, unknown>,
  timeoutMs = 10_000
): Promise<TgApiResult<T>> {
  const token = decryptToken(encryptedToken);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const json = (await res.json()) as TgApiResult<T>;
    return json;
  } catch (e) {
    return {
      ok: false,
      error_code: 0,
      description: e instanceof Error ? e.message : String(e),
    };
  } finally {
    clearTimeout(timer);
  }
}

export function tgSendMessage(
  encryptedToken: string,
  chatId: string | number,
  text: string,
  opts: SendMessageOptions = {}
) {
  return callApi<TgMessageResult>(encryptedToken, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: opts.parse_mode ?? "HTML",
    disable_web_page_preview: opts.disable_web_page_preview ?? true,
    reply_markup: opts.reply_markup,
    reply_to_message_id: opts.reply_to_message_id,
  });
}

export function tgSendPhoto(
  encryptedToken: string,
  chatId: string | number,
  photoUrl: string,
  opts: SendPhotoOptions = {}
) {
  return callApi<TgMessageResult>(encryptedToken, "sendPhoto", {
    chat_id: chatId,
    photo: photoUrl,
    caption: opts.caption,
    parse_mode: opts.parse_mode ?? "HTML",
    reply_markup: opts.reply_markup,
  });
}

export function tgAnswerCallbackQuery(
  encryptedToken: string,
  callbackQueryId: string,
  opts: { text?: string; show_alert?: boolean } = {}
) {
  return callApi<true>(encryptedToken, "answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text: opts.text,
    show_alert: opts.show_alert,
  });
}

export interface GetMeResult {
  id: number;
  is_bot: boolean;
  first_name: string;
  username: string;
  can_join_groups?: boolean;
  can_read_all_group_messages?: boolean;
  supports_inline_queries?: boolean;
}

export function tgGetMe(encryptedToken: string) {
  return callApi<GetMeResult>(encryptedToken, "getMe", {});
}

export function tgSetWebhook(
  encryptedToken: string,
  url: string,
  secretToken: string,
  allowedUpdates: string[] = ["message", "edited_message", "callback_query", "my_chat_member"]
) {
  return callApi<true>(encryptedToken, "setWebhook", {
    url,
    secret_token: secretToken,
    allowed_updates: allowedUpdates,
    drop_pending_updates: false,
  });
}

export function tgDeleteWebhook(encryptedToken: string) {
  return callApi<true>(encryptedToken, "deleteWebhook", {
    drop_pending_updates: false,
  });
}

export interface WebhookInfo {
  url: string;
  has_custom_certificate: boolean;
  pending_update_count: number;
  last_error_date?: number;
  last_error_message?: string;
}

export function tgGetWebhookInfo(encryptedToken: string) {
  return callApi<WebhookInfo>(encryptedToken, "getWebhookInfo", {});
}

// Maps Telegram error_code -> our recipient.status.
// Used by the broadcast worker to decide retry vs hard-fail.
export function classifyTgError(
  res: TgApiResult<unknown>
): "retry" | "blocked" | "fatal" {
  if (res.ok) return "fatal";
  const code = res.error_code;
  const desc = (res.description ?? "").toLowerCase();
  if (code === 429) return "retry";
  // 403 + various "blocked" / "deactivated" descriptions = the user is unreachable.
  if (code === 403) return "blocked";
  if (
    desc.includes("bot was blocked") ||
    desc.includes("user is deactivated") ||
    desc.includes("chat not found")
  ) {
    return "blocked";
  }
  // Network or 5xx — retry.
  if (code === 0 || (code !== undefined && code >= 500)) return "retry";
  return "fatal";
}
