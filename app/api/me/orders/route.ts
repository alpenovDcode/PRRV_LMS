import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";

/**
 * GET /api/me/orders
 *
 * История заказов текущего пользователя. Любой авторизованный клиент
 * видит свои покупки. Возвращаем только публичные поля — без
 * ykPaymentId, ykSnapshot, refundReason и других internal деталей.
 */
export async function GET(req: NextRequest) {
  return withAuth(req, async (authedReq) => {
    const orders = await db.order.findMany({
      where: { userId: authedReq.user!.userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        amount: true,
        currency: true,
        paymentMethod: true,
        paidAt: true,
        createdAt: true,
        refundedAt: true,
        refundedAmount: true,
        snapshotOfferTitle: true,
        snapshotCourseIds: true,
        paymentLinkToken: true,
        offer: { select: { id: true, title: true } },
      } as any,
    });

    // Для незавершённых заказов с paymentLinkToken — даём ссылку оплатить
    // (это заказы созданные админом). Для своих заказов без токена —
    // нет ссылки, нужно идти на /checkout/[offerId].
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://prrv.tech";
    const data = orders.map((o: any) => ({
      id: o.id,
      status: o.status,
      amount: o.amount.toString(),
      currency: o.currency,
      paymentMethod: o.paymentMethod,
      paidAt: o.paidAt,
      createdAt: o.createdAt,
      refundedAt: o.refundedAt,
      refundedAmount: o.refundedAmount?.toString() ?? null,
      offerTitle: o.snapshotOfferTitle ?? o.offer?.title ?? "—",
      courseCount: o.snapshotCourseIds?.length ?? 0,
      paymentUrl:
        o.status === "pending" && o.paymentLinkToken
          ? `${appUrl}/pay/${o.id}?token=${o.paymentLinkToken}`
          : null,
    }));

    return NextResponse.json({ success: true, data });
  });
}
