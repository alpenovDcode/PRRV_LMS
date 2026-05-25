import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getProvider } from "@/lib/payments";
import { activateOrder } from "@/lib/payments/activate-order";

/**
 * POST /api/payments/webhook
 * Принимает уведомления от платёжного провайдера.
 * URL регистрируется в личном кабинете провайдера.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const headers: Record<string, string> = {};
    req.headers.forEach((v, k) => { headers[k] = v; });

    const provider = getProvider();
    const result = await provider.parseWebhook(body, headers);

    if (!result) {
      // Вебхук не распознан (другой провайдер или тест-пинг)
      return NextResponse.json({ ok: true });
    }

    // Ищем заказ по providerPaymentId
    const order = await db.order.findFirst({
      where: { ykPaymentId: result.providerPaymentId },
    });

    if (!order) {
      console.warn("[webhook] Order not found for payment:", result.providerPaymentId);
      return NextResponse.json({ ok: true });
    }

    // Маппинг статусов провайдера → OrderStatus
    const statusMap: Record<string, string> = {
      paid: "paid",
      waiting_for_capture: "waiting_for_capture",
      cancelled: "cancelled",
      refunded: "refunded",
      pending: "pending",
    };

    const newStatus = (statusMap[result.status] ?? "pending") as any;

    // Обновляем снапшот в любом случае
    await db.order.update({
      where: { id: order.id },
      data: {
        status: newStatus,
        paymentMethod: result.paymentMethod ?? order.paymentMethod,
        ykSnapshot: result.raw as any,
        ...(result.paidAt ? { paidAt: result.paidAt } : {}),
      },
    });

    // Активируем заказ (выдаём доступ) только при успешной оплате
    if (result.status === "paid") {
      await activateOrder(order.id);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[webhook] Error:", err);
    // Возвращаем 200 чтобы провайдер не повторял запрос бесконечно
    return NextResponse.json({ ok: false, error: String(err) });
  }
}
