import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/** GET /api/offers/[id] — публичный оффер с деталями курсов */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const offer = await db.offer.findUnique({
    where: { id, isActive: true },
  });

  if (!offer) {
    return NextResponse.json({ success: false, error: "Оффер не найден" }, { status: 404 });
  }

  // Подтягиваем названия курсов для отображения на чекауте
  const courses =
    offer.courseIds.length > 0
      ? await db.course.findMany({
          where: { id: { in: offer.courseIds } },
          select: { id: true, title: true, coverImage: true },
        })
      : [];

  return NextResponse.json({ success: true, data: { ...offer, courses } });
}
