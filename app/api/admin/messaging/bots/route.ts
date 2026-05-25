import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { UserRole } from "@prisma/client";

/** GET /api/admin/messaging/bots — список подключённых каналов (без TG, он отдельно) */
export async function GET(req: NextRequest) {
  return withAuth(
    req,
    async () => {
      const bots = await db.messagingBot.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          channel: true,
          externalAccountId: true,
          title: true,
          isActive: true,
          tokenExpiresAt: true,
          meta: true,
          createdAt: true,
          _count: { select: { subscribers: true } },
        },
      });
      return NextResponse.json({ success: true, data: bots });
    },
    { roles: [UserRole.admin] }
  );
}
