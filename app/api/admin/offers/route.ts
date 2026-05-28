import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { UserRole } from "@prisma/client";
import { z } from "zod";

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
    const data = offerSchema.parse(body);

    const offer = await db.offer.create({ data });
    return NextResponse.json({ success: true, data: offer }, { status: 201 });
  }, { roles: [UserRole.admin] });
}
