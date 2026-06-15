/**
 * POST /api/tg/external-event
 *
 * Webhook от внешних систем (GetCourse / Bizon365 / любая CRM). Пускает
 * реактивные flows с триггером external_event.
 *
 * Тело:
 *   {
 *     "botId": "<uuid>",
 *     "eventName": "<любая строка, например 'autointensive0426_ap'>",
 *     "subscriber": {              // как найти нашего подписчика
 *        "tgUserId"?: "123",
 *        "chatId"?: "456",
 *        "email"?: "x@y.ru"
 *     },
 *     "properties"?: { ... }       // прокидывается в trigger.run.context
 *   }
 *
 * Авторизация: заголовок `Authorization: Bearer <EXTERNAL_EVENT_SECRET>`
 * (env). Без secret'а endpoint отвечает 503 — намеренно, чтобы случайный
 * деплой без env'а не открывал webhook для всех.
 *
 * Если подписчик не найден — возвращаем 200 с note (внешняя система не
 * должна ретраить). Если найден — стартуем подходящие flows и отвечаем.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { timingSafeEqual } from "crypto";
import { fireReactiveTriggers } from "@/lib/tg/lists";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  botId: z.string().min(1),
  eventName: z.string().min(1).max(120),
  subscriber: z.object({
    tgUserId: z.string().optional(),
    chatId: z.string().optional(),
    email: z.string().email().optional(),
  }),
  properties: z.record(z.string(), z.unknown()).optional(),
});

function tokenMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const expected = process.env.EXTERNAL_EVENT_SECRET;
  if (!expected) {
    return NextResponse.json(
      { success: false, error: "EXTERNAL_EVENT_SECRET not configured" },
      { status: 503 }
    );
  }
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token || !tokenMatches(token, expected)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.message },
      { status: 400 }
    );
  }

  const { botId, eventName, subscriber: who, properties } = parsed.data;

  // Резолвим подписчика. Приоритет: tgUserId > chatId > email.
  // Не используем OR в одном запросе, чтобы случайно не сматчить два
  // разных подписчика — берём по самому надёжному ключу.
  let sub = null as Awaited<ReturnType<typeof db.tgSubscriber.findFirst>> | null;
  if (who.tgUserId) {
    sub = await db.tgSubscriber.findFirst({
      where: { botId, tgUserId: who.tgUserId },
    });
  }
  if (!sub && who.chatId) {
    sub = await db.tgSubscriber.findUnique({
      where: { botId_chatId: { botId, chatId: who.chatId } },
    });
  }
  if (!sub && who.email) {
    // Через LMS-связку (subscriber → User → email).
    const user = await db.user.findUnique({ where: { email: who.email } });
    if (user) {
      sub = await db.tgSubscriber.findFirst({
        where: { botId, lmsUserId: user.id },
      });
    }
  }

  if (!sub) {
    return NextResponse.json({
      success: true,
      data: { matched: 0, note: "subscriber not found" },
    });
  }

  await fireReactiveTriggers({
    botId,
    subscriberId: sub.id,
    triggerKind: "external_event",
    matcher: (t) => t.type === "external_event" && t.eventName === eventName,
    triggerInfo: { eventName, ...properties },
  });

  return NextResponse.json({
    success: true,
    data: { matched: 1, subscriberId: sub.id },
  });
}
