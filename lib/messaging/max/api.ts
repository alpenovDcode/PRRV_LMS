/**
 * lib/messaging/max/api.ts
 *
 * Низкоуровневая обёртка над MAX Bot API.
 *
 * Базовый URL: https://platform-api.max.ru
 * Авторизация: HTTP header "Authorization: <bot_token>" (без слова Bearer)
 *
 * Документация: https://dev.max.ru/docs-api
 */

import { MAX_API_BASE } from "./config";

// ─── Типы MAX API ───────────────────────────────────────────────────────────

export interface MaxBotInfo {
  user_id: number;
  name: string;
  username?: string;
  is_bot: boolean;
}

/** Кнопка в inline-клавиатуре MAX */
export type MaxButton =
  | {
      type: "callback";
      text: string;
      /** Произвольная строка, прилетит в message_callback event */
      payload: string;
      intent?: "default" | "positive" | "negative";
    }
  | {
      type: "link";
      text: string;
      url: string;
    };

export interface MaxInlineKeyboardAttachment {
  type: "inline_keyboard";
  payload: {
    /** Массив рядов; каждый ряд — массив кнопок */
    buttons: MaxButton[][];
  };
}

export interface MaxSendMessageInput {
  /** Куда отправить — обычно chat_id из inbound webhook'а */
  chatId: number;
  text: string;
  format?: "markdown" | "html";
  attachments?: MaxInlineKeyboardAttachment[];
}

// ─── Helper для запросов ───────────────────────────────────────────────────

async function maxCall<T>(
  token: string,
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: unknown
): Promise<T> {
  const url = `${MAX_API_BASE}${path}`;
  const resp = await fetch(url, {
    method,
    headers: {
      Authorization: token,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`MAX API ${method} ${path} failed: ${resp.status} ${errText.slice(0, 300)}`);
  }
  return resp.json();
}

// ─── Public API ────────────────────────────────────────────────────────────

/** Проверка токена + получение публичной инфы о боте */
export async function getMe(token: string): Promise<MaxBotInfo> {
  return maxCall<MaxBotInfo>(token, "GET", "/me");
}

/** Отправка текстового сообщения. Можно приложить inline-клавиатуру. */
export async function sendMessage(
  token: string,
  input: MaxSendMessageInput
): Promise<{ message_id: string }> {
  const body: Record<string, unknown> = {
    chat_id: input.chatId,
    text: input.text,
  };
  if (input.format) body.format = input.format;
  if (input.attachments && input.attachments.length > 0) {
    body.attachments = input.attachments;
  }

  const resp = await maxCall<{ message?: { mid?: string }; mid?: string }>(
    token,
    "POST",
    "/messages",
    body
  );
  return { message_id: String(resp.message?.mid ?? resp.mid ?? "") };
}

/**
 * Регистрация webhook'а. MAX запрещает одновременно webhook и long-polling.
 *
 * MAX отправит подтверждающий запрос на указанный URL для проверки.
 * URL должен отдавать 200 на любой первый запрос.
 */
export async function subscribeWebhook(token: string, url: string): Promise<void> {
  await maxCall(token, "POST", "/subscriptions", { url });
}

/** Отключение webhook'а (при удалении бота). */
export async function unsubscribeWebhook(token: string, url: string): Promise<boolean> {
  try {
    await maxCall(token, "DELETE", `/subscriptions?url=${encodeURIComponent(url)}`);
    return true;
  } catch (e) {
    console.warn("[max-api] unsubscribe webhook failed:", e);
    return false;
  }
}
