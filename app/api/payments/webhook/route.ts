import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getProvider } from "@/lib/payments";
import { activateOrder } from "@/lib/payments/activate-order";

// ─── Лимиты ─────────────────────────────────────────────────────────────────
const MAX_BODY_BYTES = 64 * 1024; // 64 KB — реальные вебхуки в разы меньше

/**
 * POST /api/payments/webhook
 *
 * Принимает уведомления от платёжного провайдера.
 *
 * Контракт безопасности:
 *   1. parseWebhook ОБЯЗАН верифицировать подпись/HMAC и бросать исключение
 *      на невалидной подписи. Возврат null = «не наш вебхук» (пинг/тест).
 *   2. Если parseWebhook бросает — это атака или неверная конфигурация.
 *      Возвращаем 401 (без деталей). Логируем внутрь.
 *   3. Статус 'paid' терминальный — никогда не откатываем уже оплаченный заказ.
 *   4. Тело ограничено 64KB чтобы атакующий не мог писать гигабайты JSON в БД.
 *   5. Никакие подробности ошибок наружу не возвращаем — только { ok }.
 */
export async function POST(req: NextRequest) {
  // Лимит тела
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

  let body: unknown;
  try {
    body = JSON.parse(rawText);
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => {
    headers[k] = v;
  });

  // ── Верификация и парсинг через провайдера. ──────────────────────────────
  const provider = getProvider();
  let result;
  try {
    result = await provider.parseWebhook(body, headers);
  } catch (err) {
    console.error("[webhook] Signature/parse rejection:", err);
    return new NextResponse(null, { status: 401 });
  }

  if (!result) {
    // Не наш вебхук — успешно проигнорировали.
    return NextResponse.json({ ok: true });
  }

  // ── Ищем заказ. ──────────────────────────────────────────────────────────
  const order = await db.order.findFirst({
    where: { ykPaymentId: result.providerPaymentId },
    select: { id: true, status: true },
  });
  if (!order) {
    console.warn("[webhook] Order not found for payment:", result.providerPaymentId);
    return NextResponse.json({ ok: true });
  }

  // ── Терминальный paid: никогда не откатываем уже оплаченный заказ. ───────
  if (order.status === "paid") {
    return NextResponse.json({ ok: true });
  }

  // ── Маппинг статусов провайдера → OrderStatus. ───────────────────────────
  const statusMap: Record<string, "paid" | "waiting_for_capture" | "cancelled" | "refunded" | "pending"> = {
    paid: "paid",
    waiting_for_capture: "waiting_for_capture",
    cancelled: "cancelled",
    refunded: "refunded",
    pending: "pending",
  };
  const newStatus = statusMap[result.status] ?? "pending";

  if (result.status === "paid") {
    // Активация атомарна — все обновления внутри activateOrder.
    try {
      await activateOrder(order.id);
      // После активации обновим snapshot и метод оплаты (status уже paid).
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
    // Не paid — обновляем только промежуточные поля (status, snapshot).
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

  return NextResponse.json({ ok: true });
}
