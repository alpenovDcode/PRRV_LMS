/**
 * lib/payments/refund-order.ts
 *
 * Оркестратор возврата платежа. Вызывается из админ-API.
 *
 * Шаги:
 *   1. Атомарный lock: переводим статус в "refunded" ТОЛЬКО если был "paid".
 *      Если уже refunded — возвращаем idempotent-результат, ничего не делаем.
 *   2. Вызываем provider.refund() — реальный возврат денег.
 *      Если упало — откатываем lock (status → paid) и пробрасываем ошибку.
 *   3. Опционально отзываем доступ: удаляем Enrollment'ы по snapshotCourseIds.
 *      Тариф НЕ трогаем — он мог быть выдан другим заказом.
 *   4. Аудит-лог.
 */

import { db } from "@/lib/db";
import { logAction } from "@/lib/audit";
import { getProvider } from "./index";

export interface RefundOrderInput {
  orderId: string;
  /** Сумма возврата. Если undefined — полный возврат. */
  amount?: number;
  /** Причина возврата (для аудита) */
  reason?: string;
  /** Удалить Enrollment'ы для курсов из snapshotCourseIds. По умолчанию true. */
  revokeAccess?: boolean;
  /** Кто инициировал (для аудита) */
  actorUserId: string;
}

export interface RefundOrderResult {
  alreadyRefunded: boolean;
  refundId?: string;
  amount?: number;
  revokedCourseIds?: string[];
}

export async function refundOrder(input: RefundOrderInput): Promise<RefundOrderResult> {
  // ── 1. Lock: только paid → refunded ──────────────────────────────────────
  // Если кто-то параллельно делает refund — только один пройдёт.
  const lock = await db.order.updateMany({
    where: { id: input.orderId, status: "paid" },
    data: { status: "refunded" },
  });

  if (lock.count === 0) {
    // Либо заказ уже refunded, либо не paid. Проверяем что именно.
    const current = await db.order.findUnique({
      where: { id: input.orderId },
      select: { id: true, status: true } as any,
    });
    if (!current) throw new Error("Заказ не найден");
    if ((current as any).status === "refunded") {
      return { alreadyRefunded: true };
    }
    throw new Error(`Невозможно вернуть заказ со статусом «${(current as any).status}»`);
  }

  // ── 2. Читаем полную инфу о заказе ──────────────────────────────────────
  const order = await db.order.findUniqueOrThrow({
    where: { id: input.orderId },
    select: {
      id: true,
      userId: true,
      amount: true,
      ykPaymentId: true,
      offerId: true,
      snapshotCourseIds: true,
      snapshotOfferTitle: true,
    } as any,
  });
  const orderAny = order as any;

  if (!orderAny.ykPaymentId) {
    // Странная ситуация: paid без providerPaymentId. Откатываем lock.
    await db.order.update({
      where: { id: input.orderId },
      data: { status: "paid" },
    });
    throw new Error("У заказа нет ID транзакции у провайдера — нечего возвращать");
  }

  // ── 3. Вызываем провайдера ──────────────────────────────────────────────
  let refundResult;
  try {
    const provider = getProvider();
    refundResult = await provider.refund({
      providerPaymentId: orderAny.ykPaymentId,
      amount: input.amount ?? Number(orderAny.amount),
      idempotencyKey: input.orderId,
      reason: input.reason,
    });
  } catch (err) {
    // Откатываем lock — заказ остаётся paid.
    await db.order.update({
      where: { id: input.orderId },
      data: { status: "paid" },
    });
    throw err;
  }

  // ── 4. Фиксируем результат в БД ─────────────────────────────────────────
  await db.order.update({
    where: { id: input.orderId },
    data: {
      refundedAt: new Date(),
      refundedAmount: refundResult.amount,
      refundReason: input.reason ?? null,
    } as any,
  });

  // ── 5. Отзыв доступа (опционально) ──────────────────────────────────────
  const revokeAccess = input.revokeAccess ?? true;
  const revokedCourseIds: string[] = [];
  if (revokeAccess && orderAny.snapshotCourseIds?.length > 0) {
    // Удаляем Enrollment'ы только для курсов из снапшота, и только если у
    // пользователя нет другого оплаченного заказа на тот же курс.
    for (const courseId of orderAny.snapshotCourseIds) {
      const otherPaid = await db.order.count({
        where: {
          userId: orderAny.userId,
          status: "paid",
          id: { not: input.orderId },
          snapshotCourseIds: { has: courseId },
        },
      });
      if (otherPaid > 0) continue; // есть другой заказ — оставляем доступ

      const del = await db.enrollment.deleteMany({
        where: { userId: orderAny.userId, courseId },
      });
      if (del.count > 0) revokedCourseIds.push(courseId);
    }
  }

  // ── 6. Аудит ────────────────────────────────────────────────────────────
  await logAction(
    input.actorUserId,
    "ORDER_REFUNDED",
    "Order",
    input.orderId,
    {
      offerTitle: orderAny.snapshotOfferTitle,
      amount: refundResult.amount,
      reason: input.reason ?? null,
      revokedCourseIds,
      providerRefundId: refundResult.refundId,
    }
  ).catch(() => {});

  return {
    alreadyRefunded: false,
    refundId: refundResult.refundId,
    amount: refundResult.amount,
    revokedCourseIds,
  };
}
