import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/** GET /api/offers — публичный список активных офферов */
export async function GET() {
  const offers = await db.offer.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      title: true,
      description: true,
      price: true,
      oldPrice: true,
      currency: true,
      accessDays: true,
      courseIds: true,
      tariff: true,
      features: true,
    },
  });

  return NextResponse.json({ success: true, data: offers });
}
