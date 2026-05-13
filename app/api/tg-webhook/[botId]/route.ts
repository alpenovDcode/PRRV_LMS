// Public Telegram webhook endpoint.
//
// Authentication: Telegram sends the secret in the
// `X-Telegram-Bot-Api-Secret-Token` header. We compare it (constant-time)
// to the per-bot secret stored in tg_bots.webhook_secret. The botId path
// segment is just a routing key — it is NOT a credential.
//
// Behavior: respond 200 to Telegram as fast as possible (best practice
// — keeps TG from doing webhook retries) and process the update inline.
// The handler is bounded by Node fetch timeouts inside lib/tg/api.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { handleUpdate } from "@/lib/tg/inbound";
import { timingSafeEqual } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function constantTimeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

export async function POST(
  request: NextRequest,
  { params: paramsP }: { params: Promise<{ botId: string }> }
) {
  const params = await paramsP;
  try {
    const bot = await db.tgBot.findUnique({ where: { id: params.botId } });
    // Always return 200 from this endpoint — Telegram retries 4xx/5xx and
    // we don't want a misconfigured/removed bot to back up the TG queue.
    if (!bot || !bot.isActive) {
      return NextResponse.json({ ok: true, note: "bot inactive" });
    }

    const secret = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
    if (!secret || !constantTimeEqual(secret, bot.webhookSecret)) {
      // Don't leak which side mismatched. Pretend everything's fine.
      return NextResponse.json({ ok: true });
    }

    const update = await request.json().catch(() => null);
    if (!update || typeof update !== "object" || typeof update.update_id !== "number") {
      return NextResponse.json({ ok: true, note: "ignored" });
    }

    // Process inline. lib/tg/inbound.ts is robust to bad payloads
    // and never throws (errors are logged via trackEvent).
    await handleUpdate(bot, update).catch((e) => {
      console.error("[tg-webhook] handleUpdate failed", bot.id, e);
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[tg-webhook] fatal", e);
    // Still 200 so TG doesn't pile up retries on us.
    return NextResponse.json({ ok: true });
  }
}
