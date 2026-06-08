import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { MessagingChannel, UserRole } from "@prisma/client";

/**
 * GET /api/admin/messaging/bots — список подключённых каналов (без TG,
 * он живёт в отдельной таблице TgBot и отдаётся через /api/admin/tg/bots).
 *
 * Query:
 *   ?channel=max         — только MAX-боты
 *   ?channel=instagram   — только Instagram-аккаунты
 *   (без параметра)      — все каналы из MessagingBot
 *
 * Фильтр нужен странице /admin/bots, которая объединяет в одном списке
 * TG-ботов и MAX-ботов, но Instagram-аккаунты в этот единый список не
 * подмешивает.
 */
export async function GET(req: NextRequest) {
  return withAuth(
    req,
    async () => {
      const url = new URL(req.url);
      const channelParam = url.searchParams.get("channel");
      const allowed: ReadonlyArray<MessagingChannel> = [
        MessagingChannel.max,
        MessagingChannel.instagram,
        MessagingChannel.telegram,
      ];
      const channel = allowed.find((c) => c === channelParam);
      const where = channel ? { channel } : {};

      const bots = await db.messagingBot.findMany({
        where,
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
