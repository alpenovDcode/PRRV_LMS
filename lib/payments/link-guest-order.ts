/**
 * lib/payments/link-guest-order.ts
 *
 * Привязка гостевого заказа к пользователю по email. Общая логика для:
 *   • POST /api/pay/[orderId]/identify  — когда клиент заполняет форму
 *     ФИО+email на странице оплаты;
 *   • POST /api/offer/[slug]/purchase   — когда клиент заполнил форму
 *     прямо на публичной странице оффера (тогда вторая форма на /pay
 *     уже не нужна — userId проставлен заранее).
 *
 * Поведение:
 *   • email ищется в LMS (case-insensitive).
 *     - найден  → Order.userId = найденный. После оплаты уйдёт «доступ
 *       открыт» без новых паролей.
 *     - не найден → создаём User с временным паролем, привязываем,
 *       userCreatedFromGuest=true. После оплаты — welcome-email.
 *   • Всегда записываем guestFullName/guestEmail/guestPhone в Order
 *     (snapshot того, что ввёл клиент — для аудита).
 *
 * Возвращает { userId, userCreatedFromGuest }.
 */

import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { randomBytes } from "crypto";

export interface LinkGuestOrderInput {
  orderId: string;
  fullName: string;
  email: string; // уже нормализованный lowercase
  phone?: string | null;
}

export interface LinkGuestOrderResult {
  userId: string;
  userCreatedFromGuest: boolean;
}

export async function linkGuestOrder(
  input: LinkGuestOrderInput
): Promise<LinkGuestOrderResult> {
  const { orderId, fullName, email, phone } = input;

  // ── Найти или создать пользователя по email ────────────────────────
  const existingUser = await db.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true, email: true, fullName: true },
  });

  let userId: string;
  let userCreatedFromGuest = false;

  if (existingUser) {
    userId = existingUser.id;
  } else {
    // Временный пароль НЕ хранится в БД. activate-order при оплате
    // сгенерирует password-reset-токен и пришлёт ссылку для установки
    // своего пароля (см. GUEST-6 welcome-email).
    const tempPassword = randomBytes(8).toString("base64url");
    const passwordHash = await hashPassword(tempPassword);
    const created = await db.user.create({
      data: {
        email,
        passwordHash,
        fullName: fullName || null,
        phone: phone ?? null,
        role: "student",
        emailVerified: false,
      } as any,
    });
    userId = created.id;
    userCreatedFromGuest = true;
    void tempPassword;
  }

  await db.order.update({
    where: { id: orderId },
    data: {
      userId,
      guestFullName: fullName,
      guestEmail: email,
      guestPhone: phone ?? null,
      userCreatedFromGuest,
    } as any,
  });

  return { userId, userCreatedFromGuest };
}
