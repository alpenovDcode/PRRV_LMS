/**
 * POST /api/payments/webhook/freshcredit
 *
 * Webhook от Freshcredit. Шлётся на КАЖДУЮ смену статуса заявки:
 *   pending → approved → cooling → issued
 *           ↘ cancel / rejected
 *           ↘ refund (после оформления возврата)
 *
 * Защита:
 *   • Whitelist IP: первый IP из X-Forwarded-For должен быть в FC_WEBHOOK_IPS.
 *   • Подписи/HMAC у Freshcredit нет — IP единственный механизм.
 *
 * Идемпотентность:
 *   • Один и тот же status может прийти несколько раз (ретрай 30мин/1ч/2ч,
 *     если мы не вернули 2XX). Пара (uuid, status) запоминается в
 *     Order.ykSnapshot.seenEvents — повторы пропускаются.
 *
 * Ответ:
 *   • Всегда 200 OK (даже при внутренних ошибках, чтобы Freshcredit не
 *     зациклился на ретраях).
 *   • Только при невалидном IP — 401, без подробностей.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getProviderByName } from "@/lib/payments";
import { activateOrder } from "@/lib/payments/activate-order";
import { getWebhookIpWhitelist } from "@/lib/payments/freshcredit/config";
import { FC_TERMINAL_STATUSES } from "@/lib/payments/freshcredit/provider";
import type { Prisma } from "@prisma/client";

const MAX_BODY_BYTES = 64 * 1024;

export async function POST(req: NextRequest) {
  const reqId = Math.random().toString(36).slice(2, 8);
  const pfx = `[fc-webhook:${reqId}]`;
  console.log(`${pfx} POST получен`);

  // ── 1. Лимит тела ─────────────────────────────────────────────────────
  const lenHeader = req.headers.get("content-length");
  if (lenHeader && parseInt(lenHeader) > MAX_BODY_BYTES) {
    console.warn(`${pfx} тело слишком большое: ${lenHeader} байт`);
    return new NextResponse(null, { status: 413 });
  }
  let rawText: string;
  try {
    rawText = await req.text();
    if (rawText.length > MAX_BODY_BYTES) {
      return new NextResponse(null, { status: 413 });
    }
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  // ── 2. Проверка IP ────────────────────────────────────────────────────
  const sourceIp = extractSourceIp(req);
  const whitelist = getWebhookIpWhitelist();
  if (whitelist.length === 0) {
    console.warn(
      `${pfx} FC_WEBHOOK_IPS не задан — пропускаем всех (опасно, только dev)`
    );
  } else if (!sourceIp || !whitelist.includes(sourceIp)) {
    console.warn(
      `${pfx} IP ${sourceIp ?? "?"} не в whitelist (${whitelist.join(",")})`
    );
    return new NextResponse(null, { status: 401 });
  }

  // ── 3. Парсинг через провайдера ───────────────────────────────────────
  const provider = getProviderByName("freshcredit");
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => {
    headers[k.toLowerCase()] = v;
  });
  let result;
  try {
    result = await provider.parseWebhook(rawText, headers);
  } catch (err) {
    console.error(`${pfx} parseWebhook бросил:`, err);
    return NextResponse.json({ ok: true });
  }
  if (!result) {
    console.warn(`${pfx} payload не распознан как FC-вебхук`);
    return NextResponse.json({ ok: true });
  }

  const raw = result.raw as Record<string, unknown>;
  const fcStatus = String(raw?.status ?? "");
  const uuid = result.providerPaymentId;
  const orderId = result.merchantOrderId ?? "";

  console.log(
    `${pfx} status=${fcStatus} orderId=${orderId} uuid=${uuid} → ${result.status}`
  );

  // ── 4. Поиск заказа по нашему orderId ─────────────────────────────────
  const order = await db.order.findFirst({
    where: { id: orderId },
    select: {
      id: true,
      status: true,
      ykPaymentId: true,
      ykSnapshot: true,
      paymentMethod: true,
    },
  });
  if (!order) {
    console.warn(`${pfx} заказ ${orderId} не найден`);
    return NextResponse.json({ ok: true });
  }

  // ── 5. Идемпотентность по (uuid, status) ──────────────────────────────
  const snapshot = (order.ykSnapshot as Prisma.JsonObject | null) ?? {};
  const seen = Array.isArray(snapshot.seenEvents)
    ? (snapshot.seenEvents as string[])
    : [];
  const eventKey = `${uuid}:${fcStatus}`;
  if (eventKey && seen.includes(eventKey)) {
    console.log(`${pfx} дубль (${eventKey}) — пропускаем`);
    return NextResponse.json({ ok: true });
  }

  // ── 6. Обновляем ykPaymentId и snapshot ───────────────────────────────
  const updatedSnapshot: Prisma.JsonObject = {
    ...snapshot,
    lastState: fcStatus,
    lastStatusDescription: String(raw?.statusDescription ?? ""),
    lastModifiedAt: new Date().toISOString(),
    uuid: uuid || (snapshot.uuid as string | undefined),
    contractNumber:
      typeof raw?.contractNumber === "string"
        ? raw.contractNumber
        : snapshot.contractNumber,
    paymentSum:
      typeof raw?.paymentSum === "number"
        ? raw.paymentSum
        : snapshot.paymentSum,
    creditType: raw?.creditType ?? snapshot.creditType,
    refundSum:
      typeof raw?.refundSum === "number"
        ? raw.refundSum
        : snapshot.refundSum,
    seenEvents: eventKey ? [...seen, eventKey].slice(-50) : seen,
  };

  // ── 7. Маршрутизация по нормализованному статусу ──────────────────────
  try {
    if (result.status === "paid" && order.status !== "paid") {
      await db.order.update({
        where: { id: order.id },
        data: {
          paymentMethod: result.paymentMethod ?? order.paymentMethod ?? "freshcredit",
          ykPaymentId: uuid || order.ykPaymentId,
          ykSnapshot: updatedSnapshot,
        },
      });
      await activateOrder(order.id);
      console.log(`${pfx} ✅ заказ ${order.id} активирован (status=issued)`);
    } else if (
      result.status === "cancelled" &&
      order.status === "pending"
    ) {
      await db.order.update({
        where: { id: order.id },
        data: {
          status: "cancelled",
          paymentMethod: result.paymentMethod ?? order.paymentMethod ?? "freshcredit",
          ykPaymentId: uuid || order.ykPaymentId,
          ykSnapshot: updatedSnapshot,
        },
      });
      console.log(`${pfx} ❌ заказ ${order.id} отменён (status=${fcStatus})`);
    } else if (
      result.status === "refunded" &&
      (order.status === "paid" || order.status === "pending")
    ) {
      // Возврат после оплаты — помечаем refunded. Доступ к курсу при этом
      // активным остаётся: если нужен отзыв доступа, делается через
      // refund-order оркестратор (там логика Enrollment.revoke).
      await db.order.update({
        where: { id: order.id },
        data: {
          status: "refunded",
          refundedAt: new Date(),
          paymentMethod: result.paymentMethod ?? order.paymentMethod ?? "freshcredit",
          ykPaymentId: uuid || order.ykPaymentId,
          ykSnapshot: updatedSnapshot,
        },
      });
      console.log(`${pfx} 💸 заказ ${order.id} возвращён`);
    } else {
      // Промежуточный progress (pending/approved/cooling) или повтор
      // терминального — только обновляем snapshot для timeline.
      await db.order.update({
        where: { id: order.id },
        data: {
          paymentMethod: result.paymentMethod ?? order.paymentMethod ?? "freshcredit",
          ykPaymentId: uuid || order.ykPaymentId,
          ykSnapshot: updatedSnapshot,
        },
      });
      console.log(`${pfx} progress (status=${fcStatus})`);
    }
  } catch (e) {
    console.error(`${pfx} обработка упала:`, e);
  }

  if (FC_TERMINAL_STATUSES.has(fcStatus)) {
    console.log(`${pfx} терминальный статус, новых webhook'ов не ждём`);
  }

  return NextResponse.json({ ok: true });
}

function extractSourceIp(req: NextRequest): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  // @ts-expect-error — ip в edge runtime есть, но не в типах
  return req.ip ?? null;
}
