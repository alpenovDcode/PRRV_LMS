import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { UserRole } from "@prisma/client";
import { z } from "zod";

const offerSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  price: z.number().positive(),
  oldPrice: z.number().positive().nullable().optional(),
  currency: z.string().default("RUB"),
  isActive: z.boolean().default(true),
  accessDays: z.number().int().positive().nullable().optional(),
  courseIds: z.array(z.string()).default([]),
  tariff: z.enum(["VR", "LR", "SR"]).nullable().optional(),
  features: z.array(z.string()).default([]),
  sortOrder: z.number().int().default(0),
});

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
