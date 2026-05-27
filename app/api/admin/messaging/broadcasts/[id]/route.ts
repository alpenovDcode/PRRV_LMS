import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { UserRole } from "@prisma/client";

/** GET /api/admin/messaging/broadcasts/[id] */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    req,
    async () => {
      const { id } = await params;
      const broadcast = await db.messagingBroadcast.findUnique({
        where: { id },
        include: {
          _count: { select: { recipients: true } },
        },
      });
      if (!broadcast) {
        return NextResponse.json({ success: false, error: "Не найдено" }, { status: 404 });
      }
      return NextResponse.json({ success: true, data: broadcast });
    },
    { roles: [UserRole.admin] }
  );
}

/** DELETE /api/admin/messaging/broadcasts/[id] */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    req,
    async () => {
      const { id } = await params;
      // Не даём удалить sending — иначе recipient'ы останутся orphan
      const broadcast = await db.messagingBroadcast.findUnique({
        where: { id },
        select: { status: true },
      });
      if (broadcast?.status === "sending") {
        return NextResponse.json(
          { success: false, error: "Нельзя удалить — рассылка отправляется" },
          { status: 400 }
        );
      }
      await db.messagingBroadcast.delete({ where: { id } });
      return NextResponse.json({ success: true });
    },
    { roles: [UserRole.admin] }
  );
}
