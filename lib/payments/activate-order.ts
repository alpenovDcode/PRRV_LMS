/**
 * lib/payments/activate-order.ts
 *
 * Вызывается из webhook-обработчика после подтверждения успешной оплаты.
 *
 * Безопасность:
 *   • Атомарный lock через updateMany — только ОДИН вызов реально активирует
 *     заказ; повторные вызовы (провайдер шлёт ретраи) увидят count===0 и
 *     сразу выйдут (идемпотентно).
 *   • createMany({ skipDuplicates: true }) для Enrollment — параллельные
 *     попытки создать тот же доступ не падают на unique-constraint.
 *   • Снапшот courseIds/tariff/accessDays берётся из ORDER, а не из текущего
 *     оффера — чтобы изменение оффера между покупкой и вебхуком не меняло
 *     состав покупки задним числом.
 */

import { db } from "@/lib/db";
import { logAction } from "@/lib/audit";

export async function activateOrder(orderId: string): Promise<void> {
  // ── 1. Атомарный lock: переводим в paid только если статус ещё НЕ paid.
  //      Если count === 0 — кто-то другой уже активировал, выходим.
  const lock = await db.order.updateMany({
    where: { id: orderId, status: { not: "paid" } },
    data: { status: "paid", paidAt: new Date() },
  });
  if (lock.count === 0) {
    return; // уже активирован — идемпотентно
  }

  // ── 2. Читаем заказ со снапшотом оффера (используется при активации).
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      userId: true,
      amount: true,
      offerId: true,
      snapshotCourseIds: true,
      snapshotTariff: true,
      snapshotAccessDays: true,
      snapshotOfferTitle: true,
      // Fallback на live offer для исторических заказов без snapshot.
      offer: {
        select: { title: true, courseIds: true, tariff: true, accessDays: true },
      },
    },
  });
  if (!order) {
    // race: заказ удалён — откатывать lock не нужно, статус paid безопасен
    return;
  }

  // Предпочитаем snapshot. Если snapshotCourseIds пуст (старый заказ до миграции)
  // — читаем из live offer.
  const courseIds =
    order.snapshotCourseIds.length > 0 ? order.snapshotCourseIds : order.offer.courseIds;
  const tariff = order.snapshotTariff ?? order.offer.tariff;
  const accessDays = order.snapshotAccessDays ?? order.offer.accessDays;
  const offerTitle = order.snapshotOfferTitle ?? order.offer.title;

  // ── 3. Создаём enrollment'ы атомарно. skipDuplicates защищает от повторов.
  if (courseIds.length > 0) {
    const expiresAt = accessDays
      ? new Date(Date.now() + accessDays * 86_400_000)
      : null;

    await db.enrollment.createMany({
      data: courseIds.map((courseId) => ({
        userId: order.userId,
        courseId,
        status: "active" as const,
        startDate: new Date(),
        ...(expiresAt ? { expiresAt } : {}),
      })),
      skipDuplicates: true,
    });
  }

  // ── 4. Тариф пользователя (если включён в оффер).
  if (tariff) {
    await db.user.update({
      where: { id: order.userId },
      data: { tariff },
    });
  }

  // ── 5. Аудит. logAction отдельной строкой — если запись лога упадёт,
  //      основная активация уже зафиксирована.
  await logAction(order.userId, "ORDER_PAID", "Order", orderId, {
    offerId: order.offerId,
    offerTitle,
    amount: order.amount,
    courseIds,
    tariff,
    source: "webhook",
  }).catch(() => {});
}
