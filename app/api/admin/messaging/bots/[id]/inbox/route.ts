import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { UserRole } from "@prisma/client";

/**
 * GET /api/admin/messaging/bots/[id]/inbox
 *
 * Список диалогов бота (по подписчикам), отсортированный по дате
 * последнего сообщения. Используется в Inbox UI слева.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    req,
    async () => {
      const { id } = await params;

      // Берём последнее сообщение для каждого подписчика. Простой вариант:
      // groupBy + последующий fetch. Для бота с тысячами диалогов нужно
      // оптимизировать через DISTINCT ON или materialized view.
      const lastMessages = await db.messagingMessage.findMany({
        where: { botId: id },
        orderBy: { createdAt: "desc" },
        take: 200,
        include: {
          subscriber: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              username: true,
              externalUserId: true,
              tags: true,
              operatorTakeoverAt: true,
            } as any,
          },
        },
      });

      // Группируем по subscriberId — берём первое (самое свежее) сообщение
      const seen = new Set<string>();
      const dialogs = lastMessages
        .filter((m) => {
          if (seen.has(m.subscriberId)) return false;
          seen.add(m.subscriberId);
          return true;
        })
        .map((m) => ({
          subscriberId: m.subscriberId,
          subscriber: m.subscriber,
          lastMessage: {
            text: m.text,
            direction: m.direction,
            createdAt: m.createdAt,
          },
        }));

      return NextResponse.json({ success: true, data: dialogs });
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}
