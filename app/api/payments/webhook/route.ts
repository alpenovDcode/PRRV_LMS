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

  // ── Терминальный paid: никогда не откатываем уже оплаченный заказ ───────
  if (order.status === "paid") {
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

  if (result.status === "paid") {
    try {
      await activateOrder(order.id);
      await db.order.update({
        where: { id: order.id },
        data: {
          paymentMethod: result.paymentMethod ?? undefined,
          ykSnapshot: result.raw as any,
        },
      });
    } catch (err) {
      console.error("[webhook] Activation failed:", err);
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
