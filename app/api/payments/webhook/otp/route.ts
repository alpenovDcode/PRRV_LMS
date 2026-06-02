/**
 * POST /api/payments/webhook/otp
 *
 * Webhook от ОТП Банка. Шлётся на КАЖДУЮ смену статуса заявки (10-15 раз
 * за оформление), а не только на финальный.
 *
 * Защита:
 *   • Whitelist IP: первый IP из X-Forwarded-For должен быть в OTP_WEBHOOK_IPS
 *     (за nginx; локально без прокси берём request.ip / remoteAddress).
 *   • Подписи/HMAC у ОТП нет — IP единственный механизм.
 *
 * Идемпотентность:
 *   • Один и тот же state может прийти несколько раз (ретрай если мы не
 *     вернули 200). Активацию заказа делает activateOrder с атомарным
 *     locking — повторные вызовы не дублируют.
 *   • Уже cancelled заказ повторным callback'ом не возвращаем в paid и
 *     наоборот: paid не отменяем.
 *
 * Ответ:
 *   • Всегда 200 OK (даже при внутренних ошибках, чтобы ОТП не зациклился).
 *   • Только при невалидном IP — 401, без подробностей.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getProviderByName } from "@/lib/payments";
import { activateOrder } from "@/lib/payments/activate-order";
import { getWebhookIpWhitelist } from "@/lib/payments/otp/config";
import { OTP_TERMINAL_STATES } from "@/lib/payments/otp/provider";
import type { Prisma } from "@prisma/client";

const MAX_BODY_BYTES = 64 * 1024;

export async function POST(req: NextRequest) {
  const reqId = Math.random().toString(36).slice(2, 8);
  const pfx = `[otp-webhook:${reqId}]`;
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
      `${pfx} OTP_WEBHOOK_IPS не задан — пропускаем всех (опасно, только для dev)`
    );
  } else if (!sourceIp || !whitelist.includes(sourceIp)) {
    console.warn(
      `${pfx} IP ${sourceIp ?? "?"} не в whitelist (${whitelist.join(",")})`
    );
    return new NextResponse(null, { status: 401 });
  }

  // ── 3. Парсинг через провайдера ───────────────────────────────────────
  const provider = getProviderByName("otp");
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => {
    headers[k.toLowerCase()] = v;
  });
  let result;
  try {
    result = await provider.parseWebhook(rawText, headers);
  } catch (err) {
    console.error(`${pfx} parseWebhook бросил:`, err);
    return NextResponse.json({ ok: true }); // не зацикливаем ретраи
  }
  if (!result) {
    console.warn(`${pfx} payload не распознан как ОТП-вебхук`);
    return NextResponse.json({ ok: true });
  }

  const raw = result.raw as Record<string, unknown>;
  const state = String(raw?.state ?? "");
  const stateId = String(raw?.stateId ?? "");
  const externalOrderId = result.merchantOrderId ?? "";
  const optyRequestId = result.providerPaymentId;

  console.log(
    `${pfx} state=${state} externalOrderId=${externalOrderId} opty=${optyRequestId}`
  );

  // ── 4. Поиск заказа по нашему orderId (externalOrderId) ───────────────
  const order = await db.order.findFirst({
    where: { id: externalOrderId },
    select: {
      id: true,
      status: true,
      ykPaymentId: true,
      ykSnapshot: true,
      paymentMethod: true,
    },
  });
  if (!order) {
    console.warn(
      `${pfx} заказ ${externalOrderId} не найден (возможно тест от ОТП или старая заявка)`
    );
    return NextResponse.json({ ok: true });
  }

  // ── 5. Идемпотентность по (stateId, state) ─────────────────────────────
  // В ykSnapshot накапливаем массив seenEvents, чтобы один и тот же state
  // от ретрая не активировал заказ дважды (активацию защищает и
  // activateOrder, но семантический guard — здесь, дешевле).
  const snapshot = (order.ykSnapshot as Prisma.JsonObject | null) ?? {};
  const seen = Array.isArray(snapshot.seenEvents)
    ? (snapshot.seenEvents as string[])
    : [];
  const eventKey = `${stateId}:${state}`;
  if (eventKey && seen.includes(eventKey)) {
    console.log(`${pfx} дубль (${eventKey}) — пропускаем`);
    return NextResponse.json({ ok: true });
  }

  // ── 6. Обновляем ykPaymentId на optyRequestId и пишем snapshot ────────
  const updatedSnapshot: Prisma.JsonObject = {
    ...snapshot,
    lastState: state,
    lastStateDescription: String(raw?.stateDescription ?? ""),
    lastModifiedAt: String(raw?.modifiedAt ?? ""),
    optyRequestId: optyRequestId || undefined,
    agreementNumber:
      typeof raw?.agreementNumber === "string"
        ? raw.agreementNumber
        : snapshot.agreementNumber,
    creditAmount:
      typeof raw?.creditAmount === "number"
        ? raw.creditAmount
        : snapshot.creditAmount,
    productType:
      typeof raw?.productType === "number"
        ? raw.productType
        : snapshot.productType,
    rejectCode: raw?.rejectCode ?? null,
    rejectReason: raw?.rejectReason ?? null,
    seenEvents: eventKey ? [...seen, eventKey].slice(-50) : seen,
  };

  // ── 7. Маршрутизация по нормализованному статусу ──────────────────────
  // result.status: paid | cancelled | pending (см. mapOtpStateToOurs)
  try {
    if (result.status === "paid" && order.status !== "paid") {
      await db.order.update({
        where: { id: order.id },
        data: {
          paymentMethod: result.paymentMethod ?? order.paymentMethod ?? "otp",
          ykPaymentId: optyRequestId || order.ykPaymentId,
          ykSnapshot: updatedSnapshot,
        },
      });
      await activateOrder(order.id);
      console.log(`${pfx} ✅ заказ ${order.id} активирован (state=${state})`);
    } else if (result.status === "cancelled" && order.status === "pending") {
      // Терминальный отказ. Оплаченный заказ не откатываем.
      await db.order.update({
        where: { id: order.id },
        data: {
          status: "cancelled",
          paymentMethod: result.paymentMethod ?? order.paymentMethod ?? "otp",
          ykPaymentId: optyRequestId || order.ykPaymentId,
          ykSnapshot: updatedSnapshot,
        },
      });
      console.log(
        `${pfx} ❌ заказ ${order.id} отменён (state=${state}, reason=${raw?.rejectReason ?? "—"})`
      );
    } else {
      // Промежуточный progress-событие. Только пишем снапшот для timeline.
      await db.order.update({
        where: { id: order.id },
        data: {
          paymentMethod: result.paymentMethod ?? order.paymentMethod ?? "otp",
          ykPaymentId: optyRequestId || order.ykPaymentId,
          ykSnapshot: updatedSnapshot,
        },
      });
      console.log(`${pfx} progress (state=${state}) для заказа ${order.id}`);
    }
  } catch (e) {
    console.error(`${pfx} обработка упала:`, e);
    // Всё равно 200 — иначе ОТП будет ретраить бесконечно.
  }

  if (OTP_TERMINAL_STATES.has(state)) {
    console.log(`${pfx} терминальный state, новых webhook'ов не ждём`);
  }

  return NextResponse.json({ ok: true });
}

/**
 * Извлекаем реальный IP клиента. В проде LMS живёт за nginx, поэтому реальный
 * IP первый в X-Forwarded-For. Если этого заголовка нет — берём ip из NextRequest.
 */
function extractSourceIp(req: NextRequest): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  // @ts-expect-error — ip есть в edge runtime, но не в типах
  return req.ip ?? null;
}
