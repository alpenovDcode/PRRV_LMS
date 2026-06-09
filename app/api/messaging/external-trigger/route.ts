/**
 * app/api/messaging/external-trigger/route.ts
 *
 * Webhook-приёмник внешних событий (GetCourse / amoCRM / собственного
 * сервиса). SaleBot-аналог: триггеры вида «getcourse <event>» и
 * «autointensiv_*».
 *
 * Запускает все MessagingFlow, у которых есть активный триггер
 * type=external_event с совпадающим eventName, для конкретного
 * подписчика.
 *
 * Защита: shared-secret в URL `?token=<TG_CRON_SECRET>` (тот же секрет,
 * что и у tg-cron-tick — у нас уже есть rotation policy). Без него —
 * 401, чтобы внешний мир не дёргал воронки бесплатно.
 *
 * POST body (или query):
 *   event       — обязательное имя события (например "getcourse:purchase").
 *   botId       — UUID MessagingBot. Если не задан — обрабатываются все
 *                 боты, у которых есть подходящий триггер.
 *   subscriberId — если уже знаем id MessagingSubscriber — самый
 *                 надёжный путь.
 *   externalUserId — id на стороне канала (chat_id / IGSID). Резолвится
 *                 в подписчика по (botId, externalUserId).
 *   email       — email LMS-юзера; через User.email находим
 *                 MessagingSubscriber.lmsUserId.
 *   phone       — телефон LMS-юзера, аналогично.
 *   data        — произвольный JSON, попадёт в initialContext воронки
 *                 как `external.data`.
 *
 * Ответ:
 *   matched     — сколько триггеров подошло
 *   started     — сколько flow-run'ов реально стартовало
 *   reasons[]   — почему отдельный триггер не сработал (no subscriber, и т.п.)
 *
 * Webhook идемпотентен на уровне дедупа по (triggerId, subscriberId)
 * через guard в startFlow — он отменит предыдущий running run этого же
 * подписчика в этой же воронке, не запустит дубль.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { startFlow } from "@/lib/messaging/engine/runner";
import { MessagingTriggerType } from "@prisma/client";
import { timingSafeEqual } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const inputSchema = z.object({
  event: z.string().min(1).max(200),
  botId: z.string().uuid().optional(),
  subscriberId: z.string().uuid().optional(),
  externalUserId: z.string().min(1).max(200).optional(),
  email: z.string().email().max(200).optional(),
  phone: z.string().min(3).max(40).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
});

function tokenMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const expected = process.env.TG_CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { success: false, error: "TG_CRON_SECRET not configured" },
      { status: 503 }
    );
  }
  const provided =
    url.searchParams.get("token") ||
    req.headers.get("x-trigger-token") ||
    "";
  if (!provided || !tokenMatches(provided, expected)) {
    return NextResponse.json(
      { success: false, error: "unauthorized" },
      { status: 401 }
    );
  }

  // Принимаем и JSON-body, и query (для удобства тестов / простых
  // webhook'ов которые умеют только GET-параметры).
  const body = await req.json().catch(() => ({}));
  const merged: Record<string, unknown> = { ...Object.fromEntries(url.searchParams), ...body };
  // token — служебный, не передаём дальше в event payload
  delete merged.token;
  const parsed = inputSchema.safeParse(merged);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "BAD_INPUT", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const {
    event,
    botId,
    subscriberId,
    externalUserId,
    email,
    phone,
    data,
  } = parsed.data;

  // ── Резолвим подписчика. Несколько способов, в порядке надёжности:
  //   1) явный subscriberId
  //   2) (botId, externalUserId)
  //   3) email → User → MessagingSubscriber.lmsUserId (+ опционально botId)
  //   4) phone → User → ...
  //
  // Если подписчик не найден — триггеру не на ком сработать, отвечаем
  // 200 с reason, чтобы внешняя система не ретраила бесконечно.
  let resolved: { id: string; botId: string } | null = null;
  let resolveReason: string | null = null;

  if (subscriberId) {
    const s = await db.messagingSubscriber.findUnique({
      where: { id: subscriberId },
      select: { id: true, botId: true },
    });
    if (!s) resolveReason = `subscriberId=${subscriberId} не найден`;
    else if (botId && s.botId !== botId)
      resolveReason = "subscriberId не принадлежит указанному botId";
    else resolved = s;
  } else if (botId && externalUserId) {
    const s = await db.messagingSubscriber.findUnique({
      where: { botId_externalUserId: { botId, externalUserId } },
      select: { id: true, botId: true },
    });
    if (!s) resolveReason = `подписчик ${externalUserId} в боте не найден`;
    else resolved = s;
  } else if (email || phone) {
    const user = await db.user.findFirst({
      where: {
        OR: [
          ...(email ? [{ email }] : []),
          ...(phone ? [{ phone }] : []),
        ],
      },
      select: { id: true },
    });
    if (!user) {
      resolveReason = "user по email/phone не найден";
    } else {
      const s = await db.messagingSubscriber.findFirst({
        where: {
          lmsUserId: user.id,
          ...(botId ? { botId } : {}),
        },
        select: { id: true, botId: true },
      });
      if (!s) resolveReason = "subscriber lmsUserId-привязки не имеет";
      else resolved = s;
    }
  } else {
    resolveReason = "не передан ни один способ резолвинга подписчика";
  }

  // ── Ищем активные триггеры под это событие. ────────────────────────
  const triggers = await db.messagingTrigger.findMany({
    where: {
      type: MessagingTriggerType.external_event,
      eventName: event,
      flow: {
        isActive: true,
        ...(resolved ? { botId: resolved.botId } : botId ? { botId } : {}),
      },
    },
    select: { id: true, flowId: true, flow: { select: { botId: true } } },
  });

  if (!resolved) {
    return NextResponse.json({
      success: true,
      matched: triggers.length,
      started: 0,
      reason: resolveReason,
    });
  }

  // ── Запускаем. ──────────────────────────────────────────────────────
  let started = 0;
  const reasons: Array<{ triggerId: string; error: string }> = [];
  for (const t of triggers) {
    try {
      await startFlow({
        flowId: t.flowId,
        subscriberId: resolved.id,
        initialContext: {
          trigger: "external_event",
          triggerId: t.id,
          event,
          external: { data: data ?? null },
        },
      });
      started++;
      db.messagingTrigger
        .update({
          where: { id: t.id },
          data: {
            triggerCount: { increment: 1 },
            lastTriggeredAt: new Date(),
          },
        })
        .catch(() => {});
    } catch (e) {
      reasons.push({
        triggerId: t.id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return NextResponse.json({
    success: true,
    matched: triggers.length,
    started,
    reasons,
  });
}
