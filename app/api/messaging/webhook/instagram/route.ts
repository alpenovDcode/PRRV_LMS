import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import { decrypt } from "@/lib/messaging/encryption";
import { fetchSubscriberProfile } from "@/lib/messaging/instagram/api";
import { IG_APP_SECRET, IG_WEBHOOK_VERIFY_TOKEN } from "@/lib/messaging/instagram/config";
import { dispatchInbound } from "@/lib/messaging/engine/dispatcher";
import { recordInboundMessage } from "@/lib/messaging/inbox";
import { recordEvent, EVENT_TYPES } from "@/lib/messaging/events";

const MAX_BODY_BYTES = 64 * 1024;

/**
 * GET /api/messaging/webhook/instagram
 *
 * Verify-handshake от Meta. Происходит один раз при настройке webhook'а
 * в Meta App или при обновлении подписки.
 *
 *   hub.mode=subscribe
 *   hub.verify_token=<наш IG_WEBHOOK_VERIFY_TOKEN>
 *   hub.challenge=<рандомная строка>
 *
 * Если verify_token совпадает — отвечаем challenge в plain text.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  console.log("[ig-webhook] GET verify-handshake", { mode, challenge, tokenMatch: token === IG_WEBHOOK_VERIFY_TOKEN });

  if (!IG_WEBHOOK_VERIFY_TOKEN) {
    console.error("[ig-webhook] IG_WEBHOOK_VERIFY_TOKEN не задан в env — верификация невозможна");
    return new NextResponse("Forbidden", { status: 403 });
  }

  if (mode === "subscribe" && token && challenge && token === IG_WEBHOOK_VERIFY_TOKEN) {
    console.log("[ig-webhook] верификация успешна, отвечаем challenge:", challenge);
    return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }

  console.warn("[ig-webhook] верификация провалена", {
    modeOk: mode === "subscribe",
    tokenProvided: !!token,
    tokenMatch: token === IG_WEBHOOK_VERIFY_TOKEN,
    challengeProvided: !!challenge,
  });
  return new NextResponse("Forbidden", { status: 403 });
}

/**
 * POST /api/messaging/webhook/instagram
 *
 * Входящие события от Meta. Структура payload:
 *
 *   {
 *     "object": "instagram",
 *     "entry": [
 *       {
 *         "id": "<ig_account_id>",   // на чей аккаунт пришло
 *         "time": 1234,
 *         "messaging": [
 *           {
 *             "sender":    { "id": "<igsid>" },
 *             "recipient": { "id": "<our_account_id>" },
 *             "timestamp": 1234,
 *             "message":   { "mid": "...", "text": "...", "quick_reply"?: { "payload": "..." } }
 *           }
 *         ]
 *       }
 *     ]
 *   }
 *
 * Безопасность:
 *   • Лимит тела 64KB.
 *   • Подпись X-Hub-Signature-256 = sha256=HMAC(body, IG_APP_SECRET).
 *     Сравниваем через timingSafeEqual чтобы не утекать таймингом.
 *   • Без подписи — 401, без подробностей наружу.
 */
export async function POST(req: NextRequest) {
  const reqId = Math.random().toString(36).slice(2, 8);
  console.warn(`[ig-webhook:${reqId}] POST получен`);

  // ── Проверка env ─────────────────────────────────────────────────────────
  if (!IG_APP_SECRET) {
    console.error(`[ig-webhook:${reqId}] КРИТИЧНО: IG_APP_SECRET не задан в env — все запросы будут отклонены с 401`);
    return new NextResponse(null, { status: 401 });
  }

  const lenHeader = req.headers.get("content-length");
  if (lenHeader && parseInt(lenHeader) > MAX_BODY_BYTES) {
    console.warn(`[ig-webhook:${reqId}] тело слишком большое: ${lenHeader} байт`);
    return new NextResponse(null, { status: 413 });
  }

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) {
    console.warn(`[ig-webhook:${reqId}] тело слишком большое после чтения: ${raw.length} байт`);
    return new NextResponse(null, { status: 413 });
  }

  // ── Верификация подписи ─────────────────────────────────────────────────
  const signature = req.headers.get("x-hub-signature-256") ?? "";
  console.log(`[ig-webhook:${reqId}] подпись от Meta: ${signature ? signature.slice(0, 20) + "..." : "ОТСУТСТВУЕТ"}`);

  if (!signature) {
    console.warn(`[ig-webhook:${reqId}] заголовок x-hub-signature-256 отсутствует — запрос не от Meta или продукт Instagram не добавлен в приложение`);
    return new NextResponse(null, { status: 401 });
  }

  if (!verifyMetaSignature(raw, signature, IG_APP_SECRET)) {
    console.error(`[ig-webhook:${reqId}] подпись не совпала — проверь IG_APP_SECRET в env (должен совпадать с "App Secret" в Meta Dashboard)`);
    return new NextResponse(null, { status: 401 });
  }
  console.log(`[ig-webhook:${reqId}] подпись OK`);

  let payload: any;
  try {
    payload = JSON.parse(raw);
  } catch {
    console.error(`[ig-webhook:${reqId}] не удалось распарсить JSON: ${raw.slice(0, 200)}`);
    return new NextResponse(null, { status: 400 });
  }

  console.log(`[ig-webhook:${reqId}] object="${payload?.object}", entries=${payload?.entry?.length ?? 0}`);

  // Если это не наш object — игнор.
  if (payload?.object !== "instagram") {
    console.warn(`[ig-webhook:${reqId}] object="${payload?.object}" — не instagram, пропускаем`);
    return NextResponse.json({ ok: true });
  }

  // ── Обрабатываем события ────────────────────────────────────────────────
  try {
    for (const entry of payload.entry ?? []) {
      const igAccountId = entry.id as string;
      const messagingCount = entry.messaging?.length ?? 0;
      const changesCount = entry.changes?.length ?? 0;

      console.warn(`[ig-webhook:${reqId}] entry id=${igAccountId}, messaging=${messagingCount}, changes=${changesCount}`);

      if (changesCount > 0) {
        console.warn(`[ig-webhook:${reqId}] changes:`, JSON.stringify(entry.changes).slice(0, 200));
      }

      const bot = await db.messagingBot.findUnique({
        where: {
          channel_externalAccountId: { channel: "instagram", externalAccountId: igAccountId },
        },
      });

      if (!bot) {
        console.warn(`[ig-webhook:${reqId}] бот с externalAccountId="${igAccountId}" не найден в БД — аккаунт не подключён или id не совпадает`);
        continue;
      }
      if (!bot.isActive) {
        console.warn(`[ig-webhook:${reqId}] бот id=${bot.id} неактивен (isActive=false) — пропускаем`);
        continue;
      }
      console.warn(`[ig-webhook:${reqId}] бот найден: id=${bot.id}`);

      // Пропускаем entry только если в нём вообще нет событий. Комментарии
      // приходят в changes (без messaging) — их нельзя терять на этом шаге,
      // иначе триггеры keyword_comment не сработают.
      if (messagingCount === 0 && changesCount === 0) {
        console.warn(`[ig-webhook:${reqId}] нет событий в entry (ни messaging, ни changes)`);
        continue;
      }

      // DM-сообщения и нажатия кнопок
      for (const event of entry.messaging ?? []) {
        const senderId = event?.sender?.id;
        const text = event?.message?.text;
        const mid = event?.message?.mid;

        // ЭХО собственных исходящих сообщений бота. Instagram присылает их
        // обратно как message с sender = id самого аккаунта (или is_echo=true).
        // Их НЕЛЬЗЯ обрабатывать как входящие: иначе текст ответа бота
        // (содержащий ключевые слова) триггерит воронку на самого себя, и
        // отправка уходит на собственный id → IGApiException code 100
        // "не удаётся найти пользователя", плюс бесконечная петля.
        if (event?.message?.is_echo || String(senderId) === String(igAccountId)) {
          console.log(`[ig-webhook:${reqId}] эхо собственного сообщения (sender=${senderId}) — пропускаем`);
          continue;
        }

        // Диагностика: выводим ПОЛНУЮ структуру события для отладки
        // message_edit без sender.id означает что подписка на messages не работает
        // или пришёл echo собственного сообщения бота
        const hasMessageEdit = !!event?.message_edit;
        const hasMessage = !!event?.message;
        const hasPostback = !!event?.postback;
        const hasRead = !!event?.read;
        const hasDelivery = !!event?.delivery;
        console.warn(
          `[ig-webhook:${reqId}] событие: sender=${senderId ?? "НЕТ"}, ` +
          `text="${text?.slice(0, 50) ?? "(нет текста)"}", mid=${mid ?? "нет"}, ` +
          `keys=${Object.keys(event).join(",")}, ` +
          `hasMessage=${hasMessage}, hasMessageEdit=${hasMessageEdit}, hasPostback=${hasPostback}, ` +
          `hasRead=${hasRead}, hasDelivery=${hasDelivery}`
        );

        // message_edit — служебное уведомление об изменении сообщения, не входящее DM
        // Если приходит message_edit ВМЕСТО message — проблема в подписке subscribed_apps
        if (hasMessageEdit && !hasMessage) {
          console.warn(`[ig-webhook:${reqId}] ВНИМАНИЕ: получен message_edit без message. ` +
            `Это означает что подписка на поле "messages" не активна на уровне аккаунта. ` +
            `Нужно повторно вызвать subscribeToMessagingWebhook для accountId=${igAccountId}`);
          continue;
        }

        // read/delivery — игнорируем без логирования
        if ((hasRead || hasDelivery) && !hasMessage && !hasPostback) {
          continue;
        }

        await processInboundEvent(bot, event, reqId).catch((e) => {
          console.error(`[ig-webhook:${reqId}] processInboundEvent failed:`, e);
        });
      }

      // Комментарии под постами (field="comments") приходят в entry.changes,
      // а НЕ в entry.messaging. Без этого блока триггеры keyword_comment
      // никогда не срабатывают.
      for (const change of entry.changes ?? []) {
        await processCommentChange(bot, igAccountId, change).catch((e) => {
          console.error("[ig-webhook] processCommentChange failed:", e);
        });
      }
    }
  } catch (e) {
    console.error(`[ig-webhook:${reqId}] processing failed:`, e);
    // Всегда возвращаем 200 чтобы Meta не повторяла бесконечно.
  }

  console.log(`[ig-webhook:${reqId}] завершён`);
  return NextResponse.json({ ok: true });
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function verifyMetaSignature(rawBody: string, signature: string, appSecret: string): boolean {
  if (!signature || !appSecret) return false;
  if (!signature.startsWith("sha256=")) return false;
  const provided = signature.slice("sha256=".length);

  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");

  // timing-safe compare
  const a = Buffer.from(provided, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function processInboundEvent(
  bot: { id: string; tokenEnc: string },
  event: any,
  reqId: string
): Promise<void> {
  const pfx = `[ig-webhook:${reqId}]`;
  const senderIgsid = event?.sender?.id;
  if (!senderIgsid) {
    console.warn(`${pfx} событие без sender.id — пропускаем`, JSON.stringify(event).slice(0, 200));
    return;
  }

  const text: string | undefined = event?.message?.text;
  const quickReplyPayload: string | undefined = event?.message?.quick_reply?.payload;
  const now = new Date();

  if (!text && !quickReplyPayload) {
    console.log(`${pfx} сообщение от ${senderIgsid} без текста и payload (возможно: лайк, стикер, медиа) — пропускаем`);
    return;
  }

  // Upsert подписчика. Если первый раз — тянем профиль через API.
  let subscriber = await db.messagingSubscriber.findUnique({
    where: { botId_externalUserId: { botId: bot.id, externalUserId: senderIgsid } },
  });

  if (!subscriber) {
    console.log(`${pfx} новый подписчик ${senderIgsid} — создаём запись, тянем профиль`);
    let profile: { name?: string; profile_pic?: string } = {};
    try {
      profile = await fetchSubscriberProfile(senderIgsid, decrypt(bot.tokenEnc));
      console.log(`${pfx} профиль получен: name="${profile.name}"`);
    } catch (e) {
      console.warn(`${pfx} не удалось получить профиль для ${senderIgsid}:`, e);
    }

    subscriber = await db.messagingSubscriber.create({
      data: {
        botId: bot.id,
        externalUserId: senderIgsid,
        username: profile.name ?? null,
        firstName: profile.name?.split(" ")[0] ?? null,
        lastName: profile.name?.split(" ").slice(1).join(" ") || null,
        lastInboundAt: now,
        lastSeenAt: now,
        subscribedAt: now,
      },
    });
    console.log(`${pfx} подписчик создан: id=${subscriber.id}`);
    await recordEvent({
      botId: bot.id,
      type: EVENT_TYPES.SUBSCRIBER_CREATED,
      subscriberId: subscriber.id,
      data: { channel: "instagram" },
    });
  } else {
    console.log(`${pfx} подписчик найден: id=${subscriber.id}`);
    await db.messagingSubscriber.update({
      where: { id: subscriber.id },
      data: { lastInboundAt: now, lastSeenAt: now },
    });
  }

  // Сохраняем входящее в Inbox
  await recordInboundMessage({
    botId: bot.id,
    subscriberId: subscriber.id,
    text,
    callbackPayload: quickReplyPayload,
    externalMessageId: event?.message?.mid,
  }).catch((e) => {
    console.error(`${pfx} не удалось сохранить в Inbox:`, e);
  });
  console.log(`${pfx} сообщение сохранено в Inbox`);

  // Маршрутизация в flow-engine
  try {
    const result = await dispatchInbound({
      subscriberId: subscriber.id,
      botId: bot.id,
      triggerType: "keyword_dm",
      text: text ?? "",
      payload: quickReplyPayload,
    });
    if (result.takeover) {
      console.log(`${pfx} диалог под управлением оператора — воронки отключены`);
    } else if (result.resumed) {
      console.log(`${pfx} возобновлён активный wait_reply для подписчика ${senderIgsid}`);
    } else if (result.triggeredFlowId) {
      console.log(`${pfx} запущена воронка id=${result.triggeredFlowId} для ${senderIgsid}`);
    } else {
      console.warn(`${pfx} НЕТ СОВПАДЕНИЙ — текст "${(text ?? quickReplyPayload ?? "").slice(0, 80)}" не совпал ни с одним триггером. Проверь: созданы ли воронки, активны ли триггеры, совпадают ли keywords`);
    }
  } catch (e) {
    console.error(`${pfx} dispatch failed:`, e);
  }
}

/**
 * Комментарий под постом аккаунта. Приходит в entry.changes (field="comments"),
 * структура value:
 *   {
 *     "from":  { "id": "<commenter_igsid>", "username": "..." },
 *     "media": { "id": "<media_id>", "media_product_type": "..." },
 *     "id":    "<comment_id>",
 *     "text":  "<текст комментария>",
 *     "parent_id"?: "<id родительского комментария>"
 *   }
 *
 * Запускаем flow по триггерам типа keyword_comment, передавая mediaId —
 * чтобы триггер мог быть ограничен конкретным постом.
 */
async function processCommentChange(
  bot: { id: string },
  igAccountId: string,
  change: any
): Promise<void> {
  if (change?.field !== "comments") return;

  const value = change.value ?? {};
  const commenterId: string | undefined = value?.from?.id;
  const text: string | undefined = value?.text;
  const mediaId: string | undefined = value?.media?.id;
  const commentId: string | undefined = value?.id;

  if (!commenterId || !text) return;
  // Не реагируем на собственные комментарии аккаунта (эхо).
  if (String(commenterId) === String(igAccountId)) return;

  const now = new Date();

  let subscriber = await db.messagingSubscriber.findUnique({
    where: { botId_externalUserId: { botId: bot.id, externalUserId: commenterId } },
  });
  if (!subscriber) {
    const username: string | null = value?.from?.username ?? null;
    subscriber = await db.messagingSubscriber.create({
      data: {
        botId: bot.id,
        externalUserId: commenterId,
        username,
        firstName: username,
        lastInboundAt: now,
        lastSeenAt: now,
        subscribedAt: now,
      },
    });
    await recordEvent({
      botId: bot.id,
      type: EVENT_TYPES.SUBSCRIBER_CREATED,
      subscriberId: subscriber.id,
      data: { channel: "instagram", via: "comment" },
    });
  } else {
    await db.messagingSubscriber.update({
      where: { id: subscriber.id },
      data: { lastInboundAt: now, lastSeenAt: now },
    });
  }

  try {
    const result = await dispatchInbound({
      subscriberId: subscriber.id,
      botId: bot.id,
      triggerType: "keyword_comment",
      text,
      mediaId,
      commentId,
    });
    if (result.triggeredFlowId) {
      console.log(
        `[ig-webhook] comment triggered flow ${result.triggeredFlowId} from ${commenterId}`
      );
    } else {
      console.log(`[ig-webhook] comment no match for "${text.slice(0, 50)}"`);
    }
  } catch (e) {
    console.error("[ig-webhook] comment dispatch failed:", e);
  }
}
