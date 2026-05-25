import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { getProvider } from "@/lib/payments";
import { z } from "zod";

const schema = z.object({
  offerId: z.string(),
});

/**
 * POST /api/payments/create
 * Создаёт заказ + инициирует платёж через активный провайдер.
 * Возвращает URL для редиректа пользователя на страницу оплаты.
 */
export async function POST(req: NextRequest) {
  return withAuth(req, async (authedReq) => {
    const body = await req.json();
    const { offerId } = schema.parse(body);

    const userId = authedReq.user!.userId;

    const offer = await db.offer.findUnique({ where: { id: offerId, isActive: true } });
    if (!offer) {
      return NextResponse.json({ success: false, error: "Оффер не найден" }, { status: 404 });
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { email: true, phone: true, fullName: true },
    });

    // Создаём заказ в БД (status: pending)
    const order = await db.order.create({
      data: {
        userId,
        offerId,
        amount: offer.price,
        currency: offer.currency,
        status: "pending",
      },
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://prrv.tech";
    const returnUrl = `${appUrl}/payments/success?orderId=${order.id}`;

    // Создаём платёж у провайдера
    const provider = getProvider();
    const payment = await provider.createPayment({
      orderId: order.id,
      amount: Number(offer.price),
      currency: offer.currency as any,
      description: `Оплата: ${offer.title}`,
      returnUrl,
      customerEmail: user?.email,
      customerPhone: user?.phone ?? undefined,
      metadata: { orderId: order.id, userId, offerId },
    });

    // Сохраняем ID и URL платежа
    await db.order.update({
      where: { id: order.id },
      data: {
        ykPaymentId: payment.providerPaymentId,
        ykConfirmationUrl: payment.confirmationUrl,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        orderId: order.id,
        confirmationUrl: payment.confirmationUrl,
      },
    });
  });
}
