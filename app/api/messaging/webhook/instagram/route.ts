import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import { decrypt } from "@/lib/messaging/encryption";
import { fetchSubscriberProfile } from "@/lib/messaging/instagram/api";
import { IG_APP_SECRET, IG_WEBHOOK_VERIFY_TOKEN } from "@/lib/messaging/instagram/config";
import { dispatchInbound } from "@/lib/messaging/engine/dispatcher";

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

  if (mode === "subscribe" && token && challenge && token === IG_WEBHOOK_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
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
  const lenHeader = req.headers.get("content-length");
  if (lenHeader && parseInt(lenHeader) > MAX_BODY_BYTES) {
    return new NextResponse(null, { status: 413 });
  }

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) {
    return new NextResponse(null, { status: 413 });
  }

  // ── Верификация подписи ─────────────────────────────────────────────────
  const signature = req.headers.get("x-hub-signature-256") ?? "";
  if (!verifyMetaSignature(raw, signature, IG_APP_SECRET)) {
    console.warn("[ig-webhook] invalid signature");
    return new NextResponse(null, { status: 401 });
  }

  let payload: any;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  // Если это не наш object — игнор.
  if (payload?.object !== "instagram") {
    return NextResponse.json({ ok: true });
  }

  // ── Обрабатываем события ────────────────────────────────────────────────
  try {
    for (const entry of payload.entry ?? []) {
      const igAccountId = entry.id as string;
      const bot = await db.messagingBot.findUnique({
        where: {
          channel_externalAccountId: { channel: "instagram", externalAccountId: igAccountId },
        },
      });
      if (!bot || !bot.isActive) continue;

      for (const event of entry.messaging ?? []) {
        await processInboundEvent(bot, event).catch((e) => {
          console.error("[ig-webhook] processInboundEvent failed:", e);
        });
      }
    }
  } catch (e) {
    console.error("[ig-webhook] processing failed:", e);
    // Всегда возвращаем 200 чтобы Meta не повторяла бесконечно.
  }

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
  event: any
): Promise<void> {
  const senderIgsid = event?.sender?.id;
  if (!senderIgsid) return;

  const text: string | undefined = event?.message?.text;
  const quickReplyPayload: string | undefined = event?.message?.quick_reply?.payload;
  const now = new Date();

  // Upsert подписчика. Если первый раз — тянем профиль через API.
  let subscriber = await db.messagingSubscriber.findUnique({
    where: { botId_externalUserId: { botId: bot.id, externalUserId: senderIgsid } },
  });

  if (!subscriber) {
    let profile: { name?: string; profile_pic?: string } = {};
    try {
      profile = await fetchSubscriberProfile(senderIgsid, decrypt(bot.tokenEnc));
    } catch (e) {
      console.warn("[ig-webhook] failed to fetch profile:", e);
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
  } else {
    await db.messagingSubscriber.update({
      where: { id: subscriber.id },
      data: { lastInboundAt: now, lastSeenAt: now },
    });
  }

  // Маршрутизация в flow-engine (Этап 1)
  if (text || quickReplyPayload) {
    try {
      const result = await dispatchInbound({
        subscriberId: subscriber.id,
        botId: bot.id,
        triggerType: "keyword_dm",
        text: text ?? "",
        payload: quickReplyPayload,
      });
      if (result.resumed) {
        console.log(`[ig-webhook] resumed flow for ${senderIgsid}`);
      } else if (result.triggeredFlowId) {
        console.log(`[ig-webhook] triggered flow ${result.triggeredFlowId} for ${senderIgsid}`);
      } else {
        console.log(`[ig-webhook] no match for "${(text ?? quickReplyPayload ?? "").slice(0, 50)}"`);
      }
    } catch (e) {
      console.error("[ig-webhook] dispatch failed:", e);
    }
  }
}
