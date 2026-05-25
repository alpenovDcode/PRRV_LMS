import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";

/**
 * GET /api/payments/status/[orderId]
 *
 * Возвращает текущий статус заказа. Только владелец может увидеть свой заказ.
 * При попытке посмотреть чужой — отвечаем 404 (а не 403), чтобы не раскрывать
 * сам факт существования заказа.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  return withAuth(req, async (authedReq) => {
    const { orderId } = await params;

    // Единственный запрос: где userId совпадает с авторизованным.
    // Несовпадение → null → 404.
    const order = await db.order.findFirst({
      where: { id: orderId, userId: authedReq.user!.userId },
      select: {
        id: true,
        status: true,
        paidAt: true,
        paymentMethod: true,
        offer: { select: { title: true } },
      },
    });

    if (!order) {
      return NextResponse.json(
        { success: false, error: "Заказ не найден" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: order });
  });
}
