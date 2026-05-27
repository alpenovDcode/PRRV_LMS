import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { UserRole } from "@prisma/client";

/**
 * GET /api/admin/messaging/subscribers/[id]/messages?limit=50
 *
 * История сообщений конкретного подписчика. Используется в Inbox UI справа.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    req,
    async () => {
      const { id } = await params;
      const limit = Math.min(parseInt(new URL(req.url).searchParams.get("limit") ?? "100"), 500);

      const messages = await db.messagingMessage.findMany({
        where: { subscriberId: id },
        orderBy: { createdAt: "desc" },
        take: limit,
      });

      // Реверс для UI (старые сверху)
      return NextResponse.json({
        success: true,
        data: messages.reverse(),
      });
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}
