import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { timingSafeEqual } from "crypto";

/**
 * GET /api/pay/[orderId]?token=<paymentLinkToken>
 *
 * Публичный endpoint (без auth). Защищён через `paymentLinkToken` —
 * без правильного токена возвращает 404, как будто заказа не существует.
 *
 * Возвращает информацию о заказе для отрисовки страницы /pay/[orderId]:
 * название оффера, цена, статус, данные клиента (только имя — email не
 * показываем чтобы не утечь PII случайному визитёру).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;
  const token = new URL(req.url).searchParams.get("token") ?? "";

  if (!token) {
    return NextResponse.json({ success: false, error: "Не найдено" }, { status: 404 });
  }

  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      status: true,
      amount: true,
      currency: true,
      paymentLinkToken: true,
      snapshotOfferTitle: true,
      paidAt: true,
      offer: { select: { title: true, description: true } },
      user: { select: { fullName: true } },
    } as any,
  });

  if (!order || !(order as any).paymentLinkToken) {
    return NextResponse.json({ success: false, error: "Не найдено" }, { status: 404 });
  }

  // Timing-safe сравнение токенов
  const a = Buffer.from((order as any).paymentLinkToken);
  const b = Buffer.from(token);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ success: false, error: "Не найдено" }, { status: 404 });
  }

  const orderAny = order as any;
  // ОТП доступен, если на сервере задан OTP_SHOP_CODE. Фронт по этому флагу
  // показывает кнопку «В кредит/рассрочку (ОТП Банк)» рядом с основной.
  const otpEnabled = !!process.env.OTP_SHOP_CODE;

  return NextResponse.json({
    success: true,
    data: {
      orderId: orderAny.id,
      status: orderAny.status,
      amount: orderAny.amount.toString(),
      currency: orderAny.currency,
      paidAt: orderAny.paidAt,
      offerTitle: orderAny.snapshotOfferTitle ?? orderAny.offer?.title ?? "",
      offerDescription: orderAny.offer?.description ?? null,
      customerName: orderAny.user?.fullName ?? null,
      otpEnabled,
    },
  });
}
