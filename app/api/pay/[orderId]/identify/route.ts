/**
 * POST /api/pay/[orderId]/identify?token=<paymentLinkToken>
 *
 * Публичный endpoint. Используется на guest-странице оплаты после того,
 * как клиент заполнил «ФИО + email + телефон» в форме.
 *
 * Поведение:
 *   • Email ищется в LMS (case-insensitive).
 *     - Если юзер найден → Order.userId привязывается к нему. На email
 *       после оплаты уйдёт «доступ к курсу открыт» (без новых паролей).
 *     - Если не найден → создаём нового User с временным паролем,
 *       Order.userId привязывается к нему, флаг userCreatedFromGuest=true.
 *       После оплаты уйдёт welcome-email с email + временным паролем.
 *   • Идемпотентно: повторный вызов с тем же email на том же Order
 *     просто валидирует и возвращает success. С другим email на уже
 *     привязанном Order — 409, чтобы не перепривязывать заказ другому
 *     человеку.
 *
 * Защита: paymentLinkToken (timing-safe). Без правильного токена 404.
 */

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual, randomBytes } from "crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  fullName: z
    .string()
    .min(2, "Имя слишком короткое")
    .max(120, "Имя слишком длинное")
    .transform((s) => s.trim()),
  email: z
    .string()
    .email("Некорректный email")
    .max(254)
    .transform((s) => s.trim().toLowerCase()),
  phone: z
    .string()
    .max(32)
    .optional()
    .transform((s) => (s ? s.trim() : undefined)),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;
  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!token) {
    return NextResponse.json(
      { success: false, error: "Не найдено" },
      { status: 404 }
    );
  }

  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      status: true,
      userId: true,
      paymentLinkToken: true,
      guestEmail: true,
    } as any,
  });
  if (!order || !(order as any).paymentLinkToken) {
    return NextResponse.json(
      { success: false, error: "Не найдено" },
      { status: 404 }
    );
  }

  // Timing-safe сравнение токена
  const a = Buffer.from((order as any).paymentLinkToken);
  const b = Buffer.from(token);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json(
      { success: false, error: "Не найдено" },
      { status: 404 }
    );
  }

  const orderAny = order as any;
  if (orderAny.status !== "pending") {
    return NextResponse.json(
      {
        success: false,
        error:
          orderAny.status === "paid"
            ? "Заказ уже оплачен"
            : "Заказ недоступен для оплаты",
      },
      { status: 410 }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Некорректные данные",
      },
      { status: 400 }
    );
  }
  const { fullName, email, phone } = parsed.data;

  // ── Идемпотентность для уже привязанного заказа ──────────────────────
  if (orderAny.userId) {
    // Проверяем, что email совпадает с тем, что в БД (по userId).
    const existing = await db.user.findUnique({
      where: { id: orderAny.userId },
      select: { email: true },
    });
    if (existing && existing.email.toLowerCase() === email) {
      return NextResponse.json({ success: true, data: { alreadyLinked: true } });
    }
    // Перепривязать заказ к другому email — нельзя.
    return NextResponse.json(
      {
        success: false,
        error:
          "Заказ уже привязан к другому email. Если это ошибка — свяжитесь с менеджером.",
      },
      { status: 409 }
    );
  }

  // ── Привязка или создание юзера ──────────────────────────────────────
  // Email уникальный в БД, ищем case-insensitive (равенство «как есть»
  // достаточно, т.к. registration уже нормализует email при создании).
  const existingUser = await db.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true, email: true, fullName: true },
  });

  let userId: string;
  let userCreatedFromGuest = false;

  if (existingUser) {
    userId = existingUser.id;
    // Дополнить fullName/phone существующему юзеру не будем — это его
    // профиль, он сам решает что показывать. Просто привязываем заказ.
  } else {
    // Создаём нового. Временный пароль уйдёт в welcome-email после оплаты,
    // если оплата состоится. До оплаты юзер уже может войти этим паролем —
    // это норма (так SaleBot/Geткурс работают).
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

    // Сохраняем временный пароль на Order — в активации он понадобится для
    // welcome-email. После отправки можно почистить (но это уже опционально).
    // Кладём в guestPhone? Нет — отдельное поле было бы чище, но не плодим
    // миграцию. Положим в memory: пароль регенерируется в activate-order
    // через resetToken — см. GUEST-6.
    // На самом деле — НЕ храним пароль в БД. activate-order сгенерирует
    // password reset token и пришлёт ссылку, юзер сам поставит свой пароль.
    void tempPassword; // не используется, оставлен только для дебага в этом коммите.
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

  return NextResponse.json({
    success: true,
    data: { linked: true, userCreated: userCreatedFromGuest },
  });
}
