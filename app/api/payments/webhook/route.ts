import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getProvider } from "@/lib/payments";
import { activateOrder } from "@/lib/payments/activate-order";

const MAX_BODY_BYTES = 64 * 1024;

/**
 * POST /api/payments/webhook
 *
 * Принимает уведомления от платёжного провайдера. Универсальный обработчик,
 * который перекладывает работу на provider.parseWebhook().
 *
 * Что обязан делать провайдер:
 *   1. Верифицировать подпись/HMAC и бросать WebhookVerificationError если невалидно.
 *   2. Распарсить тело (JSON или form-urlencoded — провайдер сам знает свой формат).
 *   3. Вернуть PaymentStatusResult со status / merchantOrderId / ackResponse.
 *   4. Если не наш payload (тест-пинг, чужой провайдер) — вернуть null.
 *
 * Что делаем здесь:
 *   • Лимитируем тело 64KB.
 *   • Ищем заказ сначала по providerPaymentId, потом по merchantOrderId
 *     (нужно для первого webhook'а от CloudPayments — у нас ещё нет TransactionId).
 *   • При первом успешном lookup сохраняем ykPaymentId (= providerPaymentId) в БД.
 *   • Терминальный paid: уже оплаченный заказ не откатываем.
 *   • Активируем через activateOrder (атомарно, идемпотентно — см. C3-C4 fixes).
 *   • Возвращаем ackResponse от провайдера, либо { ok: true }.
 */
export async function POST(req: NextRequest) {
  const lenHeader = req.headers.get("content-length");
  if (lenHeader && parseInt(lenHeader) > MAX_BODY_BYTES) {
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

  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => {
    headers[k.toLowerCase()] = v;
  });

  // ── Верификация и парсинг через провайдера ─────────────────────────────
  const provider = getProvider();
  let result;
  try {
    result = await provider.parseWebhook(rawText, headers);
  } catch (err) {
    console.error("[webhook] Signature/parse rejection:", err);
    return new NextResponse(null, { status: 401 });
  }

  if (!result) {
    // Не наш вебхук — успешно проигнорировали.
    return ackOk(undefined);
  }

  // ── Lookup заказа ───────────────────────────────────────────────────────
  // Сначала пробуем по providerPaymentId, потом по merchantOrderId (наш orderId).
  // Для CP первый webhook (Check/Pay) приходит когда ykPaymentId ещё не сохранён,
  // зато InvoiceId = наш orderId — поэтому fallback по merchantOrderId работает.
  let order = await db.order.findFirst({
    where: { ykPaymentId: result.providerPaymentId },
    select: { id: true, status: true, ykPaymentId: true },
  });
  if (!order && result.merchantOrderId) {
    order = await db.order.findFirst({
      where: { id: result.merchantOrderId },
      select: { id: true, status: true, ykPaymentId: true },
    });
  }

  if (!order) {
    console.warn(
      "[webhook] Order not found. providerPaymentId=%s merchantOrderId=%s",
      result.providerPaymentId,
      result.merchantOrderId
    );
    return ackOk(result.ackResponse);
  }

  // ── Спасаем клиентские данные из старого ykSnapshot ────────────────
  // Заказы, созданные ДО выноса анкеты/UTM в отдельные колонки, держат
  // их в ykSnapshot. Ниже мы перезапишем ykSnapshot данными провайдера,
  // поэтому СНАЧАЛА вытащим formAnswers/utm и положим в выделенные
  // колонки (только если они там ещё пусты). Спасает «зависшие»
  // pending-заказы при первой же оплате/смене статуса.
  const preserved: { formAnswers?: any; utm?: any } = {};
  try {
    const cur = await db.order.findUnique({
      where: { id: order.id },
      select: { ykSnapshot: true, formAnswers: true, utm: true } as any,
    });
    const snap = (cur as any)?.ykSnapshot;
    if (
      !(cur as any)?.formAnswers &&
      snap &&
      typeof snap === "object" &&
      snap.formAnswers &&
      typeof snap.formAnswers === "object"
    ) {
      preserved.formAnswers = snap.formAnswers;
    }
    if (
      !(cur as any)?.utm &&
      snap &&
      typeof snap === "object" &&
      snap.utm &&
      typeof snap.utm === "object"
    ) {
      preserved.utm = snap.utm;
    }
  } catch {
    // best-effort — не блокируем обработку платежа
  }

  // Если у заказа ещё нет ykPaymentId — сохраняем (используем для последующих
  // webhook'ов от того же провайдера, чтобы lookup был O(1) по индексу).
  if (!order.ykPaymentId && result.providerPaymentId !== order.id) {
    await db.order
      .update({
        where: { id: order.id },
        data: { ykPaymentId: result.providerPaymentId },
      })
      .catch(() => {});
  }

  // ── Переходы статусов ──────────────────────────────────────────────────
  //   refunded — терминальный, не уходит никуда.
  //   paid     — можно перейти ТОЛЬКО в refunded (через webhook Refund от CP
  //              или прямой вызов refund-order). Любые другие апдейты — игнор.
  if (order.status === "refunded") {
    return ackOk(result.ackResponse);
  }
  if (order.status === "paid" && result.status !== "refunded") {
    return ackOk(result.ackResponse);
  }

  // ── Маппинг статусов провайдера → OrderStatus ──────────────────────────
  const statusMap: Record<string, "paid" | "waiting_for_capture" | "cancelled" | "refunded" | "pending"> = {
    paid: "paid",
    waiting_for_capture: "waiting_for_capture",
    cancelled: "cancelled",
    refunded: "refunded",
    pending: "pending",
  };
  const newStatus = statusMap[result.status] ?? "pending";

  // Диагностический лог webhook'а: видно тип события, Status от провайдера и
  // что мы из него вывели. Полезно для разбора «почему/когда активировался».
  const rawStatus =
    result.raw && typeof (result.raw as any).Status === "string"
      ? (result.raw as any).Status
      : null;
  const rawEvent =
    result.raw && typeof (result.raw as any)._eventType === "string"
      ? (result.raw as any)._eventType
      : null;
  console.log(
    `[webhook] order=${order.id} provider=${provider.name} event=${rawEvent ?? "?"} ` +
      `providerStatus=${rawStatus ?? "?"} → normalizedStatus=${result.status}`
  );

  if (result.status === "paid") {
    try {
      await activateOrder(order.id);
      await db.order.update({
        where: { id: order.id },
        data: {
          paymentMethod: result.paymentMethod ?? undefined,
          ykSnapshot: result.raw as any,
          ...preserved,
        },
      });
    } catch (err) {
      console.error("[webhook] Activation failed:", err);
      return new NextResponse(null, { status: 500 });
    }
  } else if (result.status === "refunded") {
    // Refund webhook от CP. Если возврат был инициирован через нашу админку,
    // refundedAt уже стоит — НЕ перезаписываем (идемпотентно). Если webhook
    // пришёл первым (или возврат сделан в кабинете CP вручную) — фиксируем.
    try {
      const cur = await db.order.findUnique({
        where: { id: order.id },
        select: { refundedAt: true, amount: true } as any,
      });
      const data: any = {
        status: "refunded",
        paymentMethod: result.paymentMethod ?? undefined,
        ykSnapshot: result.raw as any,
        ...preserved,
      };
      if (!(cur as any)?.refundedAt) {
        data.refundedAt = new Date();
        data.refundedAmount = (cur as any)?.amount; // полный по умолчанию
      }
      await db.order.update({ where: { id: order.id }, data });
    } catch (err) {
      console.error("[webhook] Refund update failed:", err);
      return new NextResponse(null, { status: 500 });
    }
  } else {
    try {
      await db.order.update({
        where: { id: order.id },
        data: {
          status: newStatus,
          paymentMethod: result.paymentMethod ?? undefined,
          ykSnapshot: result.raw as any,
          ...preserved,
        },
      });
    } catch (err) {
      console.error("[webhook] Order update failed:", err);
      return new NextResponse(null, { status: 500 });
    }
  }

  return ackOk(result.ackResponse);
}

/**
 * Возвращает ackResponse от провайдера, либо дефолтный { ok: true }.
 * Для CloudPayments провайдер вернёт { code: 0 } — это критично, иначе CP
 * считает webhook невалидным и блокирует следующие платежи.
 */
function ackOk(ack: Record<string, unknown> | undefined) {
  if (ack) return NextResponse.json(ack);
  return NextResponse.json({ ok: true });
}
