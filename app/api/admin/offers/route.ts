import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { formConfigSchema } from "@/lib/offers/form-config";

const offerSchema = z
  .object({
    title: z.string().min(1).max(200),
    description: z.string().max(2000).nullable().optional(),
    price: z.number().positive().max(99_999_999),
    oldPrice: z.number().positive().max(99_999_999).nullable().optional(),
    currency: z.enum(["RUB", "USD", "EUR"]).default("RUB"),
    isActive: z.boolean().default(true),
    accessDays: z.number().int().positive().max(36_500).nullable().optional(),
    courseIds: z.array(z.string().uuid()).max(50).default([]),
    tariff: z.enum(["VR", "LR", "SR"]).nullable().optional(),
    features: z.array(z.string().max(200)).max(30).default([]),
    sortOrder: z.number().int().default(0),
    /**
     * Публичный slug для страницы /offer/<slug>. URL-safe строка,
     * только латиница / цифры / дефис. Null = публичной страницы нет.
     */
    publicSlug: z
      .string()
      .min(2)
      .max(80)
      .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, "Только латиница, цифры и дефис")
      .nullable()
      .optional(),
    /** Конфиг полей формы публичной страницы. null = дефолт. */
    formConfig: formConfigSchema.nullable().optional(),
  })
  .refine(
    (d) => d.oldPrice == null || d.oldPrice >= d.price,
    { message: "Старая цена должна быть выше или равна текущей", path: ["oldPrice"] }
  );

/** GET /api/admin/offers */
export async function GET(req: NextRequest) {
  return withAuth(req, async () => {
    const offers = await db.offer.findMany({
      orderBy: { sortOrder: "asc" },
      include: { _count: { select: { orders: true } } },
    });
    return NextResponse.json({ success: true, data: offers });
  }, { roles: [UserRole.admin] });
}

/** POST /api/admin/offers */
export async function POST(req: NextRequest) {
  return withAuth(req, async () => {
    const body = await req.json();
    const { formConfig, ...data } = offerSchema.parse(body);

    const offer = await db.offer.create({
      data: {
        ...data,
        // Prisma не принимает raw null для Json — нормализуем: undefined
        // (поле не трогаем) если не передали, иначе кладём объект.
        ...(formConfig != null ? { formConfig: formConfig as object } : {}),
      },
    });
    return NextResponse.json({ success: true, data: offer }, { status: 201 });
  }, { roles: [UserRole.admin] });
}
