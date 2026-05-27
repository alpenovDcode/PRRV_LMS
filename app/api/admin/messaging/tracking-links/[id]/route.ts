import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { UserRole } from "@prisma/client";

/**
 * GET /api/admin/messaging/tracking-links/[id]
 *   Tracking-ссылка + последние 50 кликов.
 *
 * DELETE /api/admin/messaging/tracking-links/[id]
 *   Удаляет ссылку. Cascade удалит и клики.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    req,
    async () => {
      const { id } = await params;
      const link = await db.messagingTrackingLink.findUnique({
        where: { id },
        include: {
          clicks: {
            orderBy: { createdAt: "desc" },
            take: 50,
            select: {
              id: true,
              subscriberId: true,
              ip: true,
              userAgent: true,
              referer: true,
              createdAt: true,
            },
          },
        },
      });
      if (!link) {
        return NextResponse.json({ success: false, error: "Не найдено" }, { status: 404 });
      }
      return NextResponse.json({ success: true, data: link });
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    req,
    async () => {
      const { id } = await params;
      await db.messagingTrackingLink.delete({ where: { id } }).catch(() => {});
      return NextResponse.json({ success: true });
    },
    { roles: [UserRole.admin] }
  );
}
