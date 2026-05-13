import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-middleware";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Aggregated event/dashboard stats for a bot.
// Lightweight — runs queries on tg_events and tg_subscribers directly.
// At higher volumes (>5M events / bot) move these to materialized views
// or precomputed daily aggregates.

export async function GET(
  request: NextRequest,
  { params: paramsP }: { params: Promise<{ botId: string }> }
) {
  const params = await paramsP;
  return withAuth(
    request,
    async () => {
      const botId = params.botId;
      const now = new Date();
      const dayAgo = new Date(now.getTime() - 24 * 3600 * 1000);
      const weekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);

      const [
        totalSubs,
        activeWeek,
        newDay,
        blocked,
        msgsSentDay,
        msgsReceivedDay,
        topTags,
        recentEvents,
      ] = await Promise.all([
        db.tgSubscriber.count({ where: { botId } }),
        db.tgSubscriber.count({
          where: { botId, lastSeenAt: { gte: weekAgo } },
        }),
        db.tgSubscriber.count({
          where: { botId, subscribedAt: { gte: dayAgo } },
        }),
        db.tgSubscriber.count({ where: { botId, isBlocked: true } }),
        db.tgMessage.count({
          where: { botId, direction: "out", createdAt: { gte: dayAgo } },
        }),
        db.tgMessage.count({
          where: { botId, direction: "in", createdAt: { gte: dayAgo } },
        }),
        db.$queryRaw<Array<{ tag: string; count: bigint }>>`
          SELECT UNNEST(tags) AS tag, COUNT(*)::bigint AS count
          FROM tg_subscribers
          WHERE bot_id = ${botId}
          GROUP BY tag
          ORDER BY count DESC
          LIMIT 10
        `,
        db.tgEvent.findMany({
          where: { botId },
          orderBy: { occurredAt: "desc" },
          take: 30,
        }),
      ]);

      return NextResponse.json({
        success: true,
        data: {
          subscribers: {
            total: totalSubs,
            activeWeek,
            newDay,
            blocked,
          },
          messages: {
            sentDay: msgsSentDay,
            receivedDay: msgsReceivedDay,
          },
          topTags: topTags.map((t) => ({ tag: t.tag, count: Number(t.count) })),
          recentEvents,
        },
      });
    },
    { roles: ["admin"] }
  );
}
