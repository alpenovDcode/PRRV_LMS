/**
 * lib/messaging/instagram/api.ts
 *
 * Тонкая обёртка над Graph API для отправки сообщений в Instagram DM.
 *
 * Ограничения, которые учитываются здесь:
 *   - 24h messaging window: за пределами 24ч после последнего входящего
 *     можно слать только с message_tag (HUMAN_AGENT и др.).
 *     Проверка происходит на уровне выше (вызывающий код смотрит на
 *     MessagingSubscriber.lastInboundAt).
 *   - Quick replies: до 13 шт, длина text ≤ 20 chars каждый.
 */

import { IG_GRAPH_BASE } from "./config";

export interface IgSendTextInput {
  /** Long-lived access token бота */
  accessToken: string;
  /** IG account ID отправителя (наш бот) */
  fromAccountId: string;
  /** IGSID получателя (subscriber.externalUserId) */
  toIgsid: string;
  text: string;
  /** Опционально: message tag для отправки вне 24h-окна */
  messageTag?: "HUMAN_AGENT" | "POST_PURCHASE_UPDATE" | "ACCOUNT_UPDATE";
}

export async function sendText(input: IgSendTextInput): Promise<{ message_id: string }> {
  const url = `${IG_GRAPH_BASE}/v21.0/${input.fromAccountId}/messages`;

  const body: Record<string, unknown> = {
    recipient: { id: input.toIgsid },
    message: { text: input.text },
    access_token: input.accessToken,
  };
  if (input.messageTag) {
    body.messaging_type = "MESSAGE_TAG";
    body.tag = input.messageTag;
  }

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`IG sendText failed: ${resp.status} ${err.slice(0, 300)}`);
  }
  return resp.json();
}

export interface IgQuickReply {
  /** Текст кнопки, ≤ 20 chars */
  title: string;
  /** Payload — что вернётся в webhook при нажатии */
  payload: string;
}

export interface IgSendQuickRepliesInput {
  accessToken: string;
  fromAccountId: string;
  toIgsid: string;
  text: string;
  quickReplies: IgQuickReply[]; // до 13 шт
}

export async function sendQuickReplies(input: IgSendQuickRepliesInput): Promise<{ message_id: string }> {
  if (input.quickReplies.length > 13) {
    throw new Error("Instagram allows max 13 quick replies per message");
  }

  const url = `${IG_GRAPH_BASE}/v21.0/${input.fromAccountId}/messages`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { id: input.toIgsid },
      message: {
        text: input.text,
        quick_replies: input.quickReplies.map((qr) => ({
          content_type: "text",
          title: qr.title.slice(0, 20),
          payload: qr.payload,
        })),
      },
      access_token: input.accessToken,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`IG sendQuickReplies failed: ${resp.status} ${err.slice(0, 300)}`);
  }
  return resp.json();
}

/**
 * Проверка 24h messaging window. Возвращает true если последний входящий
 * был не более 24 часов назад → можно слать без message_tag.
 */
export function isWithin24hWindow(lastInboundAt: Date | null | undefined): boolean {
  if (!lastInboundAt) return false;
  return Date.now() - new Date(lastInboundAt).getTime() < 24 * 60 * 60 * 1000;
}

/** Получить профиль подписчика по IGSID (имя, фото) */
export async function fetchSubscriberProfile(
  igsid: string,
  accessToken: string
): Promise<{ name?: string; profile_pic?: string }> {
  const url =
    `${IG_GRAPH_BASE}/v21.0/${igsid}?` +
    new URLSearchParams({
      fields: "name,profile_pic",
      access_token: accessToken,
    }).toString();

  const resp = await fetch(url);
  if (!resp.ok) {
    // не критично — fallback на пустой профиль
    return {};
  }
  return resp.json();
}
