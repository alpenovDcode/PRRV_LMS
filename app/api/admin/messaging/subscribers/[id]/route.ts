import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { UserRole } from "@prisma/client";

/**
 * GET /api/admin/messaging/subscribers/[id]
 *
 * Полные данные подписчика для панели профиля в Inbox: имя, теги, переменные,
 * даты, статус оператора, канал. Используется правой панелью чата.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    req,
    async () => {
      const { id } = await params;
      const sub = await db.messagingSubscriber.findUnique({
        where: { id },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          username: true,
          externalUserId: true,
          tags: true,
          variables: true,
          subscribedAt: true,
          lastInboundAt: true,
          lastSeenAt: true,
          operatorTakeoverAt: true,
          bot: { select: { channel: true } },
        },
      });
      if (!sub) {
        return NextResponse.json(
          { success: false, error: "Подписчик не найден" },
          { status: 404 }
        );
      }
      const { bot, ...rest } = sub;
      return NextResponse.json({
        success: true,
        data: { ...rest, channel: bot.channel },
      });
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}
