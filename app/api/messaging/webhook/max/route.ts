import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { dispatchInbound } from "@/lib/messaging/engine/dispatcher";
import { recordInboundMessage } from "@/lib/messaging/inbox";
import { recordEvent, EVENT_TYPES } from "@/lib/messaging/events";

const MAX_BODY_BYTES = 64 * 1024;

/**
 * POST /api/messaging/webhook/max
 *
 * Приём событий от MAX Bot API. Поддерживаем минимально достаточные типы:
 *
 *   message_created  — новое сообщение пользователя в чат с ботом
 *   message_callback — пользователь нажал callback-кнопку
 *
 * Структура event (пример):
 *   {
 *     "update_type": "message_created",
 *     "timestamp": 1717000000,
 *     "message": {
 *       "sender": { "user_id": 123, "name": "Иван", "username": "ivan" },
 *       "recipient": { "chat_id": 999, "chat_type": "dialog" },
 *       "body": { "mid": "...", "text": "Привет" }
 *     }
 *   }
 *
 *   {
 *     "update_type": "message_callback",
 *     "callback": {
 *       "callback_id": "...",
 *       "payload": "BUY_NOW",
 *       "user": { "user_id": 123, "name": "Иван", "username": "ivan" }
 *     },
 *     "message": { "recipient": { "chat_id": 999, "chat_type": "dialog" } }
 *   }
 *
 * Безопасность:
 *   • MAX не подписывает webhook'и HMAC (в отличие от Meta/CP). Защита —
 *     уникальный URL включающий botId или random-токен. Сейчас URL общий,
 *     поэтому мы идентифицируем бота по recipient.chat_id → ищем MessagingBot
 *     с этим как externalAccountId... НЕТ, у нас externalAccountId = bot.user_id
 *     (из getMe), а в payload приходит chat_id и sender.user_id. Нужно различать.
 *
 *   • Альтернатива: при subscribeWebhook добавлять ?botId= в URL — тогда мы
 *     знаем какой бот. Но MAX подписывает URL как есть. Сделаем эту проверку
 *     через ?botId= параметр (см. config.ts).
 *
 *   • На данный момент: для MVP принимаем что в инсталляции один MAX-бот.
 *     Если несколько — расширим через query-параметр в URL подписки.
 */
export async function POST(req: NextRequest) {
  const lenHeader = req.headers.get("content-length");
  if (lenHeader && parseInt(lenHeader) > MAX_BODY_BYTES) {
    return new NextResponse(null, { status: 413 });
  }

  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  if (raw.length > MAX_BODY_BYTES) {
    return new NextResponse(null, { status: 413 });
  }

  let payload: any;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  const updateType = payload?.update_type;
  if (!updateType) {
    return NextResponse.json({ ok: true }); // ping/тестовый
  }

  // ── Определяем бота. Берём первый активный MAX-бот.
  // TODO: при наличии нескольких MAX-ботов добавить ?botId= в URL подписки
  // и фильтровать здесь.
  const url = new URL(req.url);
  const botIdQuery = url.searchParams.get("botId");
  const bot = botIdQuery
    ? await db.messagingBot.findUnique({ where: { id: botIdQuery } })
    : await db.messagingBot.findFirst({ where: { channel: "max", isActive: true } });
  if (!bot || !bot.isActive) {
    return NextResponse.json({ ok: true });
  }

  try {
    if (updateType === "message_created") {
      await handleMessage(bot, payload);
    } else if (updateType === "message_callback") {
      await handleCallback(bot, payload);
    } else if (updateType === "bot_started") {
      // Пользователь открыл бота по ссылке https://max.ru/<bot>?start=<payload>
      // и нажал «Запустить». Это MAX-аналог /start — запускаем воронку.
      await handleBotStarted(bot, payload);
    } else {
      // Неинтересные события (message_edited, ...) — игнорим
      console.log(`[max-webhook] ignoring update_type=${updateType}`);
    }
  } catch (e) {
    console.error("[max-webhook] handler failed:", e);
  }

  return NextResponse.json({ ok: true });
}

// ─── handlers ──────────────────────────────────────────────────────────────

async function handleMessage(bot: { id: string }, payload: any): Promise<void> {
  const message = payload?.message;
  if (!message) return;

  const sender = message.sender;
  const recipient = message.recipient;
  const text: string | undefined = message.body?.text;

  if (!sender?.user_id || !recipient?.chat_id) return;

  // externalUserId = chat_id (DM-чат с этим юзером). Этого достаточно для
  // отправки ответа через POST /messages c chat_id.
  const subscriber = await upsertSubscriber(bot.id, recipient.chat_id, sender);

  if (text) {
    // Сохраняем в Inbox перед dispatch — даже если flow не запустится,
    // оператор увидит сообщение.
    await recordInboundMessage({
      botId: bot.id,
      subscriberId: subscriber.id,
      text,
      externalMessageId: message.body?.mid,
    }).catch(() => {});

    await dispatchInbound({
      subscriberId: subscriber.id,
      botId: bot.id,
      triggerType: "keyword_dm",
      text,
    });
  }
}

async function handleBotStarted(bot: { id: string }, payload: any): Promise<void> {
  // Структура bot_started: { update_type, timestamp, chat_id, user, payload }
  // где payload — значение из ?start=<...> в deep-link (или null).
  const chatId = payload?.chat_id;
  const user = payload?.user;
  const startPayload: string | undefined = payload?.payload ?? undefined;

  if (!chatId || !user?.user_id) return;

  const subscriber = await upsertSubscriber(bot.id, chatId, user);

  // MAX-аналог "/start": сохраняем в Inbox и запускаем диспетчер.
  await recordInboundMessage({
    botId: bot.id,
    subscriberId: subscriber.id,
    text: "/start",
  }).catch(() => {});

  await dispatchInbound({
    subscriberId: subscriber.id,
    botId: bot.id,
    triggerType: "keyword_dm",
    text: "/start",
    // payload из ?start= — кладётся в context.lastPayload (ветвление воронок)
    payload: startPayload ? String(startPayload) : "",
  });
}

async function handleCallback(bot: { id: string }, payload: any): Promise<void> {
  const callback = payload?.callback;
  const message = payload?.message;
  const recipient = message?.recipient;
  const user = callback?.user;
  const cbPayload = callback?.payload;

  if (!user?.user_id || !recipient?.chat_id || !cbPayload) return;

  const subscriber = await upsertSubscriber(bot.id, recipient.chat_id, user);

  // Inbox: callback тоже сохраняем (без text, с callbackPayload)
  await recordInboundMessage({
    botId: bot.id,
    subscriberId: subscriber.id,
    callbackPayload: String(cbPayload),
  }).catch(() => {});

  await dispatchInbound({
    subscriberId: subscriber.id,
    botId: bot.id,
    triggerType: "keyword_dm",
    text: "",
    payload: String(cbPayload),
  });
}

async function upsertSubscriber(
  botId: string,
  chatId: number,
  user: { user_id: number; name?: string; username?: string; first_name?: string; last_name?: string }
) {
  const now = new Date();
  const externalUserId = String(chatId);

  const existing = await db.messagingSubscriber.findUnique({
    where: { botId_externalUserId: { botId, externalUserId } },
  });

  if (existing) {
    return db.messagingSubscriber.update({
      where: { id: existing.id },
      data: { lastInboundAt: now, lastSeenAt: now },
    });
  }

  const created = await db.messagingSubscriber.create({
    data: {
      botId,
      externalUserId,
      firstName: user.first_name ?? user.name?.split(" ")[0] ?? null,
      lastName: user.last_name ?? (user.name?.split(" ").slice(1).join(" ") || null),
      username: user.username ?? null,
      lastInboundAt: now,
      lastSeenAt: now,
      variables: { maxUserId: user.user_id } as any,
    },
  });
  await recordEvent({
    botId,
    type: EVENT_TYPES.SUBSCRIBER_CREATED,
    subscriberId: created.id,
    data: { channel: "max" },
  });
  return created;
}
