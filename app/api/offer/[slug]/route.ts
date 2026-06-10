/**
 * app/api/offer/[slug]/route.ts
 *
 * Публичные данные оффера для страницы /offer/<slug>. Открыто всем —
 * это маркетинговый лендинг, любой может его прочитать.
 *
 * Отдаёт: title, описание, цена, currency, features, oldPrice,
 * accessDays. НЕ отдаёт: courseIds, tariff, sortOrder и внутренние
 * поля — клиенту они не нужны, и не хочется светить структуру каталога.
 *
 * 404 если slug не найден или оффер isActive=false.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { normalizeFormConfig } from "@/lib/offers/form-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await paramsP;

  const offer = await db.offer.findFirst({
    where: { publicSlug: slug, isActive: true },
    select: {
      id: true,
      title: true,
      description: true,
      price: true,
      oldPrice: true,
      currency: true,
      features: true,
      accessDays: true,
      formConfig: true,
    },
  });

  if (!offer) {
    return NextResponse.json(
      { success: false, error: "Оффер не найден или временно недоступен" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      id: offer.id,
      title: offer.title,
      description: offer.description,
      price: offer.price.toString(),
      oldPrice: offer.oldPrice?.toString() ?? null,
      currency: offer.currency,
      features: offer.features,
      accessDays: offer.accessDays,
      formConfig: normalizeFormConfig(offer.formConfig),
    },
  });
}
