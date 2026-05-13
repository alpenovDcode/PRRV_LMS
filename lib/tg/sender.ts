// Rate-limited, side-effect-recording sender. Use this — not raw api.ts —
// from flow nodes, manual operator replies, and the broadcast worker.

import { db } from "../db";
import {
  tgSendMessage,
  tgSendPhoto,
  classifyTgError,
  type InlineKeyboard,
  type TgApiResult,
  type TgMessageResult,
} from "./api";
import { waitForSendBudget } from "./rate-limit";
import { sanitizeTelegramHtml } from "./sanitize";
import { renderTemplate, type RenderContext } from "./vars";
import { trackEvent } from "./events";
import type { FlowMessagePayload } from "./flow-schema";

export interface SendResult {
  ok: boolean;
  blocked: boolean;
  tgMessageId?: string;
  errorCode?: number;
  errorMessage?: string;
}

function payloadToKeyboard(payload: FlowMessagePayload): InlineKeyboard | undefined {
  if (!payload.buttonRows || payload.buttonRows.length === 0) return undefined;
  return payload.buttonRows.map((row) =>
    row.map((b) => {
      if (b.url) return { text: b.text, url: b.url };
      if (b.callback) return { text: b.text, callback_data: b.callback };
      // Fallback: encode goto/addTag/removeTag through a synthetic callback.
      // Format: btn:<nodeId-of-message>:<index>  — engine resolves the rest
      // from the message node graph. For broadcasts (no node), we use the
      // raw button payload only if `callback` is set; otherwise we drop
      // the button to avoid leaking flow internals.
      return { text: b.text, callback_data: "btn:noop" };
    })
  );
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
  // Buttons need to be resolvable by the engine on callback. For flow
  // sends, pass the node id so the persisted button list can be looked
  // up later. For broadcasts, this is the broadcast id.
  // Stored in tg_messages.source_id alongside source_type.
}

export async function sendBotMessage(opts: SendOptions): Promise<SendResult> {
  const text = renderTemplate(opts.payload.text, opts.renderCtx);
  const safeText = sanitizeTelegramHtml(text);
  const keyboard = payloadToKeyboard(opts.payload);

  // Acquire rate-limit budget — block briefly if needed.
  await waitForSendBudget(opts.botId, opts.chatId);

  let result: TgApiResult<TgMessageResult>;
  if (opts.payload.photoUrl) {
    result = await tgSendPhoto(opts.encryptedToken, opts.chatId, opts.payload.photoUrl, {
      caption: safeText,
      parse_mode: opts.payload.parseMode ?? "HTML",
      reply_markup: keyboard ? { inline_keyboard: keyboard } : undefined,
    });
  } else {
    result = await tgSendMessage(opts.encryptedToken, opts.chatId, safeText, {
      parse_mode: opts.payload.parseMode ?? "HTML",
      disable_web_page_preview: opts.payload.disablePreview ?? true,
      reply_markup: keyboard ? { inline_keyboard: keyboard } : undefined,
    });
  }

  if (result.ok && result.result) {
    const tgMessageId = String(result.result.message_id);
    await db.tgMessage.create({
      data: {
        botId: opts.botId,
        subscriberId: opts.subscriberId,
        direction: "out",
        tgMessageId,
        text: safeText.length > 4096 ? safeText.substring(0, 4096) : safeText,
        sourceType: opts.sourceType,
        sourceId: opts.sourceId,
      },
    });
    trackEvent({
      type: "message.sent",
      botId: opts.botId,
      subscriberId: opts.subscriberId,
      properties: { sourceType: opts.sourceType, sourceId: opts.sourceId },
    }).catch(() => {});
    return { ok: true, blocked: false, tgMessageId };
  }

  // Failure path.
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
