// Rate-limited, side-effect-recording sender. Use this — not raw api.ts —
// from flow nodes, manual operator replies, and the broadcast worker.
//
// Iter 2: full media routing. A message payload can carry up to 10
// attachments. The sender picks the right Telegram method:
//   - 0 attachments      → sendMessage
//   - 1 attachment       → sendPhoto / sendVideo / sendVoice / sendVideoNote /
//                          sendDocument / sendAudio / sendAnimation
//   - 2+ photos/videos   → sendMediaGroup (an album)
//   - 2+ mixed types     → first item via its dedicated method (with caption +
//                          buttons), then siblings sent as separate sendXxx
//                          calls (Telegram album rules forbid mixing kinds
//                          other than photo+video)

import { db } from "../db";
import {
  tgSendMessage,
  tgSendPhoto,
  tgSendVideo,
  tgSendVoice,
  tgSendVideoNote,
  tgSendAudio,
  tgSendDocument,
  tgSendAnimation,
  tgSendMediaGroup,
  classifyTgError,
  type InlineKeyboard,
  type ReplyMarkup,
  type TgApiResult,
  type TgMessageResult,
  type MediaGroupItem,
} from "./api";
import { waitForSendBudget } from "./rate-limit";
import { sanitizeTelegramHtml } from "./sanitize";
import { renderTemplate, type RenderContext } from "./vars";
import { trackEvent } from "./events";
import type { FlowMessagePayload, MediaAttachment } from "./flow-schema";

export interface SendResult {
  ok: boolean;
  blocked: boolean;
  tgMessageId?: string;
  errorCode?: number;
  errorMessage?: string;
}

// Build the reply_markup field according to the payload's keyboardMode.
// Returns undefined for messages without any keyboard.
function payloadToReplyMarkup(payload: FlowMessagePayload): ReplyMarkup | undefined {
  if (payload.keyboardMode === "remove") {
    return { remove_keyboard: true };
  }
  if (!payload.buttonRows || payload.buttonRows.length === 0) return undefined;

  if (payload.keyboardMode === "reply") {
    // Reply keyboards live under the input box. We map only the fields
    // a reply-keyboard understands: text + request_contact / request_location.
    // url/callback buttons in a reply keyboard would just send their
    // text back as a normal message — we accept that as the user's
    // intent and don't filter them out.
    const keyboard = payload.buttonRows.map((row) =>
      row.map((b) => ({
        text: b.text,
        request_contact: b.requestContact || undefined,
        request_location: b.requestLocation || undefined,
      })),
    );
    return {
      keyboard,
      resize_keyboard: true,
      one_time_keyboard: payload.oneTimeKeyboard ?? false,
    };
  }

  // Default: inline keyboard.
  const inline: InlineKeyboard = payload.buttonRows.map((row) =>
    row.map((b) => {
      if (b.url) return { text: b.text, url: b.url };
      if (b.callback) return { text: b.text, callback_data: b.callback };
      return { text: b.text, callback_data: "btn:noop" };
    }),
  );
  return { inline_keyboard: inline };
}

// Resolve the actual media reference Telegram should consume — prefer
// file_id (no upload, no size cap), fall back to URL. Returns null if
// the attachment has neither, in which case the sender skips it.
function mediaRef(att: MediaAttachment): string | null {
  return att.fileId ?? att.url ?? null;
}

// Returns true iff the attachment list is an album-compatible set
// (only photos and videos, count between 2 and 10).
function isAlbumCompatible(atts: MediaAttachment[]): boolean {
  if (atts.length < 2 || atts.length > 10) return false;
  return atts.every((a) => a.kind === "photo" || a.kind === "video");
}

export interface SendOptions {
  botId: string;
  encryptedToken: string;
  subscriberId: string;
  chatId: string;
  payload: FlowMessagePayload;
  renderCtx: RenderContext;
  sourceType: "flow" | "broadcast" | "manual" | "trigger";
  sourceId?: string;
}

export async function sendBotMessage(opts: SendOptions): Promise<SendResult> {
  const rawText = renderTemplate(opts.payload.text, opts.renderCtx);
  const safeText = sanitizeTelegramHtml(rawText);
  const replyMarkup = payloadToReplyMarkup(opts.payload);
  const parseMode = opts.payload.parseMode ?? "HTML";
  const disableNotification = opts.payload.disableNotification;

  // Resolve attachments: new `attachments[]` first, legacy `photoUrl`
  // as a single-photo fallback so flows saved pre-Iter-2 still send.
  let attachments: MediaAttachment[] = opts.payload.attachments ?? [];
  if (attachments.length === 0 && opts.payload.photoUrl) {
    attachments = [{ kind: "photo", url: opts.payload.photoUrl }];
  }
  // Drop attachments missing both fileId and url so we don't 400 on send.
  attachments = attachments.filter((a) => mediaRef(a) !== null);

  await waitForSendBudget(opts.botId, opts.chatId);

  // -- Zero attachments: plain text message ----------------------------
  if (attachments.length === 0) {
    const result = await tgSendMessage(opts.encryptedToken, opts.chatId, safeText, {
      parse_mode: parseMode,
      disable_web_page_preview: opts.payload.disablePreview ?? true,
      reply_markup: replyMarkup,
    });
    return recordResult(opts, result, safeText);
  }

  // -- Album: 2+ photos/videos, sent as a media_group -----------------
  if (isAlbumCompatible(attachments)) {
    const items: MediaGroupItem[] = attachments.map((a, i) => ({
      type: a.kind as "photo" | "video",
      media: mediaRef(a)!,
      // Telegram only displays the FIRST item's caption.
      caption: i === 0 ? safeText : undefined,
      parse_mode: i === 0 ? parseMode : undefined,
    }));
    const result = await tgSendMediaGroup(opts.encryptedToken, opts.chatId, items, {
      disable_notification: disableNotification,
    });
    // sendMediaGroup returns an ARRAY of messages; we record the first one
    // as the canonical message_id.
    if (result.ok && result.result && result.result.length > 0) {
      const first = result.result[0];
      return recordSuccess(opts, first.message_id, safeText, attachments);
    }
    return recordFailure(opts, result);
  }

  // -- Single attachment OR mixed-type bundle -------------------------
  // First attachment carries the text/caption and the inline keyboard;
  // siblings (if any) get sent as separate plain calls right after.
  const primary = attachments[0];
  const ref = mediaRef(primary)!;
  let result: TgApiResult<TgMessageResult>;
  switch (primary.kind) {
    case "photo":
      result = await tgSendPhoto(opts.encryptedToken, opts.chatId, ref, {
        caption: safeText,
        parse_mode: parseMode,
        reply_markup: replyMarkup,
        disable_notification: disableNotification,
      });
      break;
    case "video":
      result = await tgSendVideo(opts.encryptedToken, opts.chatId, ref, {
        caption: safeText,
        parse_mode: parseMode,
        reply_markup: replyMarkup,
        disable_notification: disableNotification,
        duration: primary.duration,
      });
      break;
    case "voice":
      result = await tgSendVoice(opts.encryptedToken, opts.chatId, ref, {
        caption: safeText,
        parse_mode: parseMode,
        reply_markup: replyMarkup,
        disable_notification: disableNotification,
        duration: primary.duration,
      });
      break;
    case "video_note":
      // Note: video_note cannot carry a caption in Telegram's API.
      // We send the text as a separate follow-up message below.
      result = await tgSendVideoNote(opts.encryptedToken, opts.chatId, ref, {
        reply_markup: replyMarkup,
        disable_notification: disableNotification,
        duration: primary.duration,
      });
      break;
    case "document":
      result = await tgSendDocument(opts.encryptedToken, opts.chatId, ref, {
        caption: safeText,
        parse_mode: parseMode,
        reply_markup: replyMarkup,
        disable_notification: disableNotification,
      });
      break;
    case "audio":
      result = await tgSendAudio(opts.encryptedToken, opts.chatId, ref, {
        caption: safeText,
        parse_mode: parseMode,
        reply_markup: replyMarkup,
        disable_notification: disableNotification,
        duration: primary.duration,
      });
      break;
    case "animation":
      result = await tgSendAnimation(opts.encryptedToken, opts.chatId, ref, {
        caption: safeText,
        parse_mode: parseMode,
        reply_markup: replyMarkup,
        disable_notification: disableNotification,
        duration: primary.duration,
      });
      break;
    default:
      // Unknown kind — degrade to a text message so the flow doesn't stall.
      result = await tgSendMessage(opts.encryptedToken, opts.chatId, safeText, {
        parse_mode: parseMode,
        reply_markup: replyMarkup,
      });
  }

  // For video_note, the caption was dropped — send a follow-up text
  // with the kbd attached so the user still sees the body.
  if (primary.kind === "video_note" && safeText.trim() && result.ok) {
    await waitForSendBudget(opts.botId, opts.chatId);
    await tgSendMessage(opts.encryptedToken, opts.chatId, safeText, {
      parse_mode: parseMode,
      reply_markup: replyMarkup,
      disable_web_page_preview: opts.payload.disablePreview ?? true,
    });
  }

  // Sibling attachments: send each as a standalone media message,
  // without text or kbd (those already landed with the primary).
  if (attachments.length > 1 && result.ok) {
    for (const sibling of attachments.slice(1)) {
      await waitForSendBudget(opts.botId, opts.chatId);
      const r = mediaRef(sibling)!;
      switch (sibling.kind) {
        case "photo":
          await tgSendPhoto(opts.encryptedToken, opts.chatId, r, { disable_notification: true });
          break;
        case "video":
          await tgSendVideo(opts.encryptedToken, opts.chatId, r, { disable_notification: true });
          break;
        case "voice":
          await tgSendVoice(opts.encryptedToken, opts.chatId, r, { disable_notification: true });
          break;
        case "video_note":
          await tgSendVideoNote(opts.encryptedToken, opts.chatId, r, { disable_notification: true });
          break;
        case "document":
          await tgSendDocument(opts.encryptedToken, opts.chatId, r, { disable_notification: true });
          break;
        case "audio":
          await tgSendAudio(opts.encryptedToken, opts.chatId, r, { disable_notification: true });
          break;
        case "animation":
          await tgSendAnimation(opts.encryptedToken, opts.chatId, r, { disable_notification: true });
          break;
      }
    }
  }

  return recordResult(opts, result, safeText, attachments);
}

// -- result helpers --------------------------------------------------

async function recordResult(
  opts: SendOptions,
  result: TgApiResult<TgMessageResult>,
  text: string,
  attachments: MediaAttachment[] = [],
): Promise<SendResult> {
  if (result.ok && result.result) {
    return recordSuccess(opts, result.result.message_id, text, attachments);
  }
  return recordFailure(opts, result);
}

async function recordSuccess(
  opts: SendOptions,
  tgMessageIdNum: number,
  text: string,
  attachments: MediaAttachment[],
): Promise<SendResult> {
  const tgMessageId = String(tgMessageIdNum);
  // Pick the primary attachment for the persisted message row. If we
  // sent only text, mediaType stays null.
  const primary = attachments[0];
  await db.tgMessage.create({
    data: {
      botId: opts.botId,
      subscriberId: opts.subscriberId,
      direction: "out",
      tgMessageId,
      text: text.length > 4096 ? text.substring(0, 4096) : text,
      mediaType: primary?.kind ?? null,
      mediaFileId: primary?.fileId ?? null,
      sourceType: opts.sourceType,
      sourceId: opts.sourceId,
    },
  });
  // Bump lastUsedAt on media library entries we just used — drives
  // "recently used" sort in the picker.
  for (const att of attachments) {
    if (att.fileId) {
      await db.tgMediaFile
        .updateMany({
          where: { botId: opts.botId, fileId: att.fileId },
          data: { lastUsedAt: new Date() },
        })
        .catch(() => undefined);
    }
  }
  trackEvent({
    type: "message.sent",
    botId: opts.botId,
    subscriberId: opts.subscriberId,
    properties: {
      sourceType: opts.sourceType,
      sourceId: opts.sourceId,
      mediaKinds: attachments.map((a) => a.kind),
    },
  }).catch(() => {});
  return { ok: true, blocked: false, tgMessageId };
}

async function recordFailure(
  opts: SendOptions,
  result: TgApiResult<unknown>,
): Promise<SendResult> {
  const cls = classifyTgError(result);
  const blocked = cls === "blocked";
  if (blocked) {
    await db.tgSubscriber
      .update({
        where: { id: opts.subscriberId },
        data: { isBlocked: true, unsubscribedAt: new Date() },
      })
      .catch(() => undefined);
    trackEvent({
      type: "subscriber.blocked_bot",
      botId: opts.botId,
      subscriberId: opts.subscriberId,
      properties: { errorCode: result.error_code, description: result.description },
    }).catch(() => {});
  }
  trackEvent({
    type: "message.send_failed",
    botId: opts.botId,
    subscriberId: opts.subscriberId,
    properties: {
      errorCode: result.error_code,
      description: result.description,
      classification: cls,
    },
  }).catch(() => {});
  return {
    ok: false,
    blocked,
    errorCode: result.error_code,
    errorMessage: result.description,
  };
}
