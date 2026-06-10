/**
 * app/api/offer/[slug]/purchase/route.ts
 *
 * Публичный endpoint оплаты оффера. Каждый посетитель страницы
 * /offer/<slug> при сабмите формы (ФИО + email + телефон + согласие)
 * получает СВОЙ Order — поэтому одну URL можно отправить N клиентам.
 *
 * Логика:
 *   1. Валидация формы (zod).
 *   2. Минимальная защита от ботов:
 *      - rate-limit per IP (10 запросов на 5 мин).
 *      - простое honeypot-поле (если заполнено — silent 200 без создания).
 *   3. Находим оффер по publicSlug, isActive=true.
 *   4. Создаём Order в guest-режиме (userId=null), сразу записываем
 *      guestFullName/guestEmail/guestPhone из формы.
 *   5. Возвращаем paymentUrl формата /pay/<orderId>?token=<...> — клиент
 *      сразу попадает на знакомую страницу оплаты, где уже выбирает
 *      метод (CP / OTP / Freshcredit) и платит.
 *   6. UTM-параметры со страницы сохраняем в Order.ykSnapshot.utm для
 *      последующей атрибуции в админке.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { linkGuestOrder } from "@/lib/payments/link-guest-order";
import { normalizeFormConfig } from "@/lib/offers/form-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  fullName: z.string().min(2, "Укажите ФИО").max(120),
  email: z
    .string()
    .email("Некорректный email")
    .max(200)
    .transform((s) => s.trim().toLowerCase()),
  phone: z
    .string()
    .min(3, "Укажите телефон")
    .max(40)
    .optional()
    .or(z.literal("")),
  /** Маркетинговое согласие. На фронте чекбокс. */
  consent: z.boolean().refine((v) => v === true, "Подтвердите согласие"),
  /** Honeypot — если бот заполнил, мы тихо отклонимся. */
  website: z.string().optional(),
  /** Ответы на кастомные поля оффера: { <key>: <value> }. */
  customAnswers: z.record(z.string(), z.string().max(2000)).optional(),
  /** UTM-метки, прокинутые со страницы. Все опциональны. */
  utm_source: z.string().max(120).optional(),
  utm_medium: z.string().max(120).optional(),
  utm_campaign: z.string().max(120).optional(),
  utm_content: z.string().max(120).optional(),
  utm_term: z.string().max(120).optional(),
});

// ── Простой in-memory rate-limit по IP+slug ────────────────────────────
//  10 запросов в окне 5 минут. Достаточно чтобы не сжечь БД при ddos /
//  массовом ботнете. Для серьёзной защиты на проде поверх — Cloudflare.
//  Map<key, число использованных слотов и время окна>.
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT_MAX = 10;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const b = rateBuckets.get(key);
  if (!b || b.resetAt < now) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (b.count >= RATE_LIMIT_MAX) return false;
  b.count++;
  return true;
}

export async function POST(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await paramsP;

  // ── Rate limit ──────────────────────────────────────────────────────
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  if (!checkRateLimit(`${ip}:${slug}`)) {
    return NextResponse.json(
      {
        success: false,
        error: "Слишком много запросов. Подождите несколько минут.",
      },
      { status: 429 }
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
  const data = parsed.data;

  // ── Honeypot. Бот, скорее всего, заполнит «website». Делаем вид
  //    что приняли, но НИЧЕГО не создаём. Это лучше явного 400 —
  //    не даём боту понять что его поймали.
  if (data.website && data.website.trim() !== "") {
    return NextResponse.json({
      success: true,
      data: { paymentUrl: "/" },
    });
  }

  // ── Оффер ───────────────────────────────────────────────────────────
  const offer = await db.offer.findFirst({
    where: { publicSlug: slug, isActive: true },
  });
  if (!offer) {
    return NextResponse.json(
      { success: false, error: "Оффер не найден или временно недоступен" },
      { status: 404 }
    );
  }

  // ── Серверная валидация по конфигу формы ───────────────────────────
  // Клиент мог обойти браузерную валидацию (или вообще постить напрямую),
  // поэтому required-поля и обязательность телефона проверяем здесь.
  const formConfig = normalizeFormConfig((offer as any).formConfig);
  if (formConfig.phone.show && formConfig.phone.required) {
    if (!data.phone || data.phone.trim() === "") {
      return NextResponse.json(
        { success: false, error: "Укажите телефон" },
        { status: 400 }
      );
    }
  }
  const customAnswers: Record<string, string> = {};
  for (const field of formConfig.customFields) {
    const val = (data.customAnswers?.[field.key] ?? "").trim();
    if (field.required && val === "") {
      return NextResponse.json(
        { success: false, error: `Заполните поле «${field.label}»` },
        { status: 400 }
      );
    }
    // select — значение должно быть из options (защита от подмены)
    if (field.type === "select" && val !== "") {
      const opts = field.options ?? [];
      if (!opts.includes(val)) {
        return NextResponse.json(
          { success: false, error: `Недопустимое значение поля «${field.label}»` },
          { status: 400 }
        );
      }
    }
    if (val !== "") {
      customAnswers[field.key] = val;
    }
  }

  // ── Создаём Order. userId=null (привяжется при /identify, но мы уже
  //    заполняем guest-поля прямо сейчас — клиенту не придётся ещё раз
  //    вводить те же данные на /pay).
  const paymentLinkToken = randomBytes(32).toString("hex");

  const utm = {
    source: data.utm_source ?? null,
    medium: data.utm_medium ?? null,
    campaign: data.utm_campaign ?? null,
    content: data.utm_content ?? null,
    term: data.utm_term ?? null,
  };
  // ykSnapshot.utm — самое подходящее место для атрибуции, оно уже
  // отображается в карточке заказа. formAnswers — ответы на кастомные
  // поля оффера (видны в карточке заказа). Если у заказа потом будет
  // реальный webhook от провайдера — там тоже остаётся ykSnapshot
  // со своим содержимым (seenEvents, lastState, ...), мы не перезатираем.
  const ykSnapshot: Record<string, unknown> = {
    utm,
    source: "public_offer",
    ...(Object.keys(customAnswers).length > 0 ? { formAnswers: customAnswers } : {}),
  };

  const order = await db.order.create({
    data: {
      userId: null,
      offerId: offer.id,
      amount: offer.price,
      currency: offer.currency,
      status: "pending",
      snapshotCourseIds: offer.courseIds,
      snapshotTariff: offer.tariff,
      snapshotAccessDays: offer.accessDays,
      snapshotOfferTitle: offer.title,
      paymentLinkToken,
      guestFullName: data.fullName.trim(),
      guestEmail: data.email,
      guestPhone: data.phone || null,
      ykSnapshot: ykSnapshot as object,
    } as any,
  });

  // Сразу привязываем (или создаём) пользователя по email — те же
  // данные, что клиент ввёл на лендинге, не нужно спрашивать второй раз
  // на /pay. После этого Order.userId проставлен → needsGuestInfo=false →
  // на странице оплаты сразу видны методы оплаты, без формы.
  // Best-effort: если линковка упала (например гонка email-unique) —
  // заказ всё равно создан, на /pay покажется fallback-форма.
  await linkGuestOrder({
    orderId: order.id,
    fullName: data.fullName.trim(),
    email: data.email,
    phone: data.phone || null,
  }).catch((e) => {
    console.warn("[offer/purchase] linkGuestOrder failed:", e);
  });

  // Audit. logAction требует существующего userId; для публичного
  // оффера юзера ещё нет. Пишем напрямую в auditLog без userId.
  await db.auditLog
    .create({
      data: {
        userId: null,
        action: "ORDER_CREATED_PUBLIC_OFFER",
        entity: "Order",
        entityId: order.id,
        details: {
          offerId: offer.id,
          offerSlug: slug,
          guestEmail: data.email,
          guestFullName: data.fullName,
          utm,
          ip,
        },
      } as any,
    })
    .catch(() => {});

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://prrv.tech";
  const paymentUrl = `${appUrl}/pay/${order.id}?token=${paymentLinkToken}`;

  return NextResponse.json(
    {
      success: true,
      data: {
        orderId: order.id,
        paymentUrl,
      },
    },
    { status: 201 }
  );
}
