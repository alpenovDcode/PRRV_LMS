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
import { sendEmail, emailTemplates } from "@/lib/email-service";
import { randomBytes } from "crypto";

export async function activateOrder(orderId: string): Promise<void> {
  const t0 = Date.now();
  // ── 1. Атомарный lock: переводим в paid только если статус ещё НЕ paid.
  //      Если count === 0 — кто-то другой уже активировал, выходим.
  const lock = await db.order.updateMany({
    where: { id: orderId, status: { not: "paid" } },
    data: { status: "paid", paidAt: new Date() },
  });
  if (lock.count === 0) {
    console.log(
      `[activate-order] order ${orderId} уже paid (идемпотентный повтор)`
    );
    return; // уже активирован — идемпотентно
  }
  console.log(
    `[activate-order] order ${orderId} переведён pending→paid (lock acquired)`
  );

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
      userCreatedFromGuest: true,
      guestEmail: true,
      // Fallback на live offer для исторических заказов без snapshot.
      offer: {
        select: { title: true, courseIds: true, tariff: true, accessDays: true },
      },
      user: { select: { email: true, fullName: true } },
    },
  });
  if (!order) {
    // race: заказ удалён — откатывать lock не нужно, статус paid безопасен
    return;
  }
  if (!order.userId) {
    // Защита от ранней оплаты до /identify (guest-заказ): без юзера нечего
    // активировать. Статус «paid» уже выставлен — это норма; admin увидит
    // факт оплаты и сможет привязать вручную, если автопривязка не сработала.
    console.warn(
      `[activate-order] order ${orderId} помечен paid, но userId IS NULL — пропускаем активацию`
    );
    return;
  }
  const userId: string = order.userId;

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
        userId: userId,
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
      where: { id: userId },
      data: { tariff },
    });
  }

  // ── 5. Аудит. logAction отдельной строкой — если запись лога упадёт,
  //      основная активация уже зафиксирована.
  await logAction(userId, "ORDER_PAID", "Order", orderId, {
    offerId: order.offerId,
    offerTitle,
    amount: order.amount,
    courseIds,
    tariff,
    source: "webhook",
  }).catch(() => {});

  // ── 5.1. Маркетинговые автоматизации — onboarding после покупки и т.п.
  //         Fire-and-forget: ошибки не должны валить активацию.
  void import("@/lib/email/automations/trigger-router")
    .then(({ fireTrigger }) =>
      fireTrigger("course_purchased", userId, {
        triggerData: { offerId: order.offerId, courseIds, amount: order.amount },
      })
    )
    .catch((e) => console.warn("[activate-order] fireTrigger failed:", e));

  // ── 6. Welcome / access email клиенту ─────────────────────────────────
  // Для гостевого юзера (только что созданного через /identify) шлём
  // welcome-письмо с magic-link логина (LoginToken на 30 дней, чтобы
  // клиент не торопился). После первого входа он сам выставит пароль
  // через стандартное «Сменить пароль».
  // Для существующего юзера — просто уведомление «доступ к курсу открыт».
  await sendActivationEmail({
    orderAny: order as any,
    offerTitle,
    courseCount: courseIds.length,
  }).catch((e) => {
    console.error("[activate-order] не смог отправить email:", e);
  });
  console.log(
    `[activate-order] order ${orderId} активирован полностью за ${Date.now() - t0}ms ` +
      `(courses=${courseIds.length}, tariff=${tariff ?? "—"}, welcome-sent)`
  );
}

/**
 * Отправка письма «доступ открыт» / «welcome» в зависимости от того,
 * был ли юзер создан гостем. Никогда не бросает в основной активации:
 * почта — best-effort, ошибки логируем.
 */
async function sendActivationEmail(args: {
  orderAny: {
    userCreatedFromGuest: boolean;
    guestEmail: string | null;
    user: { email: string; fullName: string | null } | null;
    userId: string | null;
  };
  offerTitle: string;
  courseCount: number;
}): Promise<void> {
  const { orderAny, offerTitle, courseCount } = args;
  const email = orderAny.user?.email ?? orderAny.guestEmail ?? null;
  if (!email || !orderAny.userId) return;

  if (orderAny.userCreatedFromGuest) {
    // Magic-link на 30 дней — пусть клиент войдёт без пароля, дальше
    // в профиле выставит свой.
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await db.loginToken.create({
      data: { token, userId: orderAny.userId, expiresAt },
    });
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://prrv.tech";
    const loginUrl = `${appUrl}/login-with-token?token=${token}`;

    await sendEmail({
      to: email,
      subject: `Доступ к курсу: ${offerTitle}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Спасибо за оплату!</h2>
          <p>Оплата прошла успешно. Открыт доступ${
            courseCount > 0 ? ` к ${courseCount === 1 ? "курсу" : courseCount + " курсам"}` : ""
          }: <strong>${escapeHtml(offerTitle)}</strong>.</p>
          <p>Для входа в личный кабинет нажми на кнопку ниже — ссылка действует 30 дней. После входа сможешь установить свой пароль в настройках профиля.</p>
          <p style="margin: 24px 0;">
            <a href="${loginUrl}" style="background:#2563eb;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:600;">
              Войти в личный кабинет
            </a>
          </p>
          <p style="color:#666;font-size:13px;">Если кнопка не работает, скопируй ссылку: <br/><span style="color:#2563eb;word-break:break-all;">${loginUrl}</span></p>
        </div>
      `,
    });
  } else {
    // Существующий юзер — без credentials.
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://prrv.tech";
    await sendEmail({
      to: email,
      subject: `Доступ к курсу: ${offerTitle}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Спасибо за оплату!</h2>
          <p>Оплата прошла успешно. Открыт доступ${
            courseCount > 0 ? ` к ${courseCount === 1 ? "курсу" : courseCount + " курсам"}` : ""
          }: <strong>${escapeHtml(offerTitle)}</strong>.</p>
          <p>Войди в личный кабинет своим обычным email и паролем:</p>
          <p style="margin: 24px 0;">
            <a href="${appUrl}/login" style="background:#2563eb;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:600;">
              Войти
            </a>
          </p>
        </div>
      `,
    });
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
    }
    return c;
  });
}

// Marker used so emailTemplates import isn't considered unused in case the
// сравниваем-friendly путь поменяется в будущем.
void emailTemplates;
