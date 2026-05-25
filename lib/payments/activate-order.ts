/**
 * lib/payments/activate-order.ts
 *
 * Вызывается после успешной оплаты (из webhook-обработчика).
 * Создаёт Enrollment'ы для курсов из оффера и обновляет тариф пользователя.
 */

import { db } from "@/lib/db";
import { logAction } from "@/lib/audit";

export async function activateOrder(orderId: string): Promise<void> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { offer: true },
  });

  if (!order) throw new Error(`Order not found: ${orderId}`);
  if (order.status === "paid") return; // идемпотентно

  const { offer } = order;

  // 1. Создаём Enrollment на каждый курс из оффера
  for (const courseId of offer.courseIds) {
    const existing = await db.enrollment.findUnique({
      where: { userId_courseId: { userId: order.userId, courseId } },
    });

    if (!existing) {
      const expiresAt =
        offer.accessDays
          ? new Date(Date.now() + offer.accessDays * 86_400_000)
          : null;

      await db.enrollment.create({
        data: {
          userId: order.userId,
          courseId,
          status: "active",
          startDate: new Date(),
          ...(expiresAt ? { expiresAt } : {}),
        },
      });
    }
  }

  // 2. Обновляем тариф пользователя (если оффер включает тариф)
  if (offer.tariff) {
    await db.user.update({
      where: { id: order.userId },
      data: { tariff: offer.tariff },
    });
  }

  // 3. Помечаем заказ оплаченным
  await db.order.update({
    where: { id: orderId },
    data: { status: "paid", paidAt: new Date() },
  });

  // 4. Аудит-лог
  await logAction(order.userId, "ORDER_PAID", "Order", orderId, {
    offerId: offer.id,
    offerTitle: offer.title,
    amount: order.amount,
    courseIds: offer.courseIds,
    tariff: offer.tariff,
  });
}
