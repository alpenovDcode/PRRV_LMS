import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";

/** GET /api/payments/status/[orderId] — текущий статус заказа (polling с чекаута) */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  return withAuth(req, async (authedReq) => {
    const { orderId } = await params;

    const order = await db.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        paidAt: true,
        paymentMethod: true,
        offer: { select: { title: true } },
      },
    });

    if (!order) {
      return NextResponse.json({ success: false, error: "Заказ не найден" }, { status: 404 });
    }

    // Пользователь может видеть только свой заказ
    const fullOrder = await db.order.findUnique({
      where: { id: orderId },
      select: { userId: true },
    });
    if (fullOrder?.userId !== authedReq.user!.userId) {
      return NextResponse.json({ success: false, error: "Нет доступа" }, { status: 403 });
    }

    return NextResponse.json({ success: true, data: order });
  });
}
