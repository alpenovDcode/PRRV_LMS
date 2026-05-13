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
  disable_notification?: boolean;
}

export interface SendMediaOptions extends SendPhotoOptions {
  // Width/height help Telegram pick the right preview. Optional.
  width?: number;
  height?: number;
  duration?: number;
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
  photoUrlOrFileId: string,
  opts: SendPhotoOptions = {}
) {
  return callApi<TgMessageResult>(encryptedToken, "sendPhoto", {
    chat_id: chatId,
    photo: photoUrlOrFileId,
    caption: opts.caption,
    parse_mode: opts.parse_mode ?? "HTML",
    reply_markup: opts.reply_markup,
    disable_notification: opts.disable_notification,
  });
}

// -- New in Iter 2: full media family.
// Each helper accepts either a URL (for stock content) or a file_id
// from the media library (preferred — instant, no upload, no size cap).

export function tgSendVideo(
  encryptedToken: string,
  chatId: string | number,
  videoUrlOrFileId: string,
  opts: SendMediaOptions = {}
) {
  return callApi<TgMessageResult>(encryptedToken, "sendVideo", {
    chat_id: chatId,
    video: videoUrlOrFileId,
    caption: opts.caption,
    parse_mode: opts.parse_mode ?? "HTML",
    reply_markup: opts.reply_markup,
    width: opts.width,
    height: opts.height,
    duration: opts.duration,
    disable_notification: opts.disable_notification,
  });
}

// Short round video ("кружочек"). Telegram strips caption and most
// formatting for these — that's a Telegram API limitation.
export function tgSendVideoNote(
  encryptedToken: string,
  chatId: string | number,
  videoNoteUrlOrFileId: string,
  opts: SendMediaOptions = {}
) {
  return callApi<TgMessageResult>(encryptedToken, "sendVideoNote", {
    chat_id: chatId,
    video_note: videoNoteUrlOrFileId,
    reply_markup: opts.reply_markup,
    duration: opts.duration,
    disable_notification: opts.disable_notification,
  });
}

export function tgSendVoice(
  encryptedToken: string,
  chatId: string | number,
  voiceUrlOrFileId: string,
  opts: SendMediaOptions = {}
) {
  return callApi<TgMessageResult>(encryptedToken, "sendVoice", {
    chat_id: chatId,
    voice: voiceUrlOrFileId,
    caption: opts.caption,
    parse_mode: opts.parse_mode ?? "HTML",
    reply_markup: opts.reply_markup,
    duration: opts.duration,
    disable_notification: opts.disable_notification,
  });
}

export function tgSendAudio(
  encryptedToken: string,
  chatId: string | number,
  audioUrlOrFileId: string,
  opts: SendMediaOptions & { title?: string; performer?: string } = {}
) {
  return callApi<TgMessageResult>(encryptedToken, "sendAudio", {
    chat_id: chatId,
    audio: audioUrlOrFileId,
    caption: opts.caption,
    parse_mode: opts.parse_mode ?? "HTML",
    reply_markup: opts.reply_markup,
    duration: opts.duration,
    title: opts.title,
    performer: opts.performer,
    disable_notification: opts.disable_notification,
  });
}

export function tgSendDocument(
  encryptedToken: string,
  chatId: string | number,
  documentUrlOrFileId: string,
  opts: SendMediaOptions = {}
) {
  return callApi<TgMessageResult>(encryptedToken, "sendDocument", {
    chat_id: chatId,
    document: documentUrlOrFileId,
    caption: opts.caption,
    parse_mode: opts.parse_mode ?? "HTML",
    reply_markup: opts.reply_markup,
    disable_notification: opts.disable_notification,
  });
}

// Animation = GIF/MP4 looped. Useful for product demos and reactions.
export function tgSendAnimation(
  encryptedToken: string,
  chatId: string | number,
  animationUrlOrFileId: string,
  opts: SendMediaOptions = {}
) {
  return callApi<TgMessageResult>(encryptedToken, "sendAnimation", {
    chat_id: chatId,
    animation: animationUrlOrFileId,
    caption: opts.caption,
    parse_mode: opts.parse_mode ?? "HTML",
    reply_markup: opts.reply_markup,
    width: opts.width,
    height: opts.height,
    duration: opts.duration,
    disable_notification: opts.disable_notification,
  });
}

// Media group / album. Telegram returns an array of Messages (one per
// item). Only "photo" and "video" can be mixed in a single album per
// Telegram's rules; the sender enforces this before calling here.
export interface MediaGroupItem {
  type: "photo" | "video" | "document" | "audio";
  media: string; // url or file_id
  caption?: string; // only the FIRST item's caption is shown by Telegram
  parse_mode?: "HTML" | "MarkdownV2";
}

export function tgSendMediaGroup(
  encryptedToken: string,
  chatId: string | number,
  items: MediaGroupItem[],
  opts: { disable_notification?: boolean } = {}
) {
  return callApi<TgMessageResult[]>(encryptedToken, "sendMediaGroup", {
    chat_id: chatId,
    media: items,
    disable_notification: opts.disable_notification,
  });
}

// "..is typing" indicator. Lasts ~5s — call right before a long-running
// node (HTTP request, AI reply) so the UX feels alive.
export type ChatAction =
  | "typing"
  | "upload_photo"
  | "record_video"
  | "upload_video"
  | "record_voice"
  | "upload_voice"
  | "upload_document"
  | "find_location"
  | "record_video_note"
  | "upload_video_note";

export function tgSendChatAction(
  encryptedToken: string,
  chatId: string | number,
  action: ChatAction,
) {
  return callApi<true>(encryptedToken, "sendChatAction", {
    chat_id: chatId,
    action,
  });
}

// Looks up file metadata by file_id. Used by the media library when an
// admin wants to refresh a stale preview thumb.
export interface TgFileInfo {
  file_id: string;
  file_unique_id: string;
  file_size?: number;
  file_path?: string;
}
export function tgGetFile(encryptedToken: string, fileId: string) {
  return callApi<TgFileInfo>(encryptedToken, "getFile", { file_id: fileId });
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
