import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { UserRole } from "@prisma/client";
import { z } from "zod";

const patchSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  price: z.number().positive().optional(),
  oldPrice: z.number().positive().nullable().optional(),
  isActive: z.boolean().optional(),
  accessDays: z.number().int().positive().nullable().optional(),
  courseIds: z.array(z.string()).optional(),
  tariff: z.enum(["VR", "LR", "SR"]).nullable().optional(),
  features: z.array(z.string()).optional(),
  sortOrder: z.number().int().optional(),
});

/** PATCH /api/admin/offers/[id] */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(req, async () => {
    const { id } = await params;
    const body = await req.json();
    const data = patchSchema.parse(body);

    const offer = await db.offer.update({ where: { id }, data });
    return NextResponse.json({ success: true, data: offer });
  }, { roles: [UserRole.admin] });
}

/** DELETE /api/admin/offers/[id] */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(req, async () => {
    const { id } = await params;

    const ordersCount = await db.order.count({ where: { offerId: id } });
    if (ordersCount > 0) {
      return NextResponse.json(
        { success: false, error: "Нельзя удалить оффер с существующими заказами. Деактивируйте его." },
        { status: 400 }
      );
    }

    await db.offer.delete({ where: { id } });
    return NextResponse.json({ success: true });
  }, { roles: [UserRole.admin] });
}
