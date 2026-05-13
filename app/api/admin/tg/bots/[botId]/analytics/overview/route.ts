import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-middleware";
import { parsePeriod } from "@/lib/tg/analytics/period";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_HEADER = "private, max-age=30, stale-while-revalidate=60";

export async function GET(
  request: NextRequest,
  { params: paramsP }: { params: Promise<{ botId: string }> }
) {
  const params = await paramsP;
  return withAuth(
    request,
    async () => {
      const botId = params.botId;
      const url = new URL(request.url);
      const period = parsePeriod({
        period: url.searchParams.get("period"),
        from: url.searchParams.get("from"),
        to: url.searchParams.get("to"),
      });
      const { from, to } = period;
      const weekAgo = new Date(to.getTime() - 7 * 24 * 3600 * 1000);

      const [
        totalSubscribers,
        activeWeek,
        newInPeriod,
        blocked,
        sentInPeriod,
        receivedInPeriod,
        growthRows,
        topEvents,
        topSourcesRaw,
      ] = await Promise.all([
        db.tgSubscriber.count({ where: { botId } }),
        db.tgSubscriber.count({ where: { botId, lastSeenAt: { gte: weekAgo } } }),
        db.tgSubscriber.count({
          where: { botId, subscribedAt: { gte: from, lte: to } },
        }),
        db.tgSubscriber.count({ where: { botId, isBlocked: true } }),
        db.tgMessage.count({
          where: { botId, direction: "out", createdAt: { gte: from, lte: to } },
        }),
        db.tgMessage.count({
          where: { botId, direction: "in", createdAt: { gte: from, lte: to } },
        }),
        db.$queryRaw<Array<{ day: Date; new_count: bigint }>>`
          SELECT
            DATE_TRUNC('day', subscribed_at) AS day,
            COUNT(*)::bigint AS new_count
          FROM tg_subscribers
          WHERE bot_id = ${botId}
            AND subscribed_at >= ${from}
            AND subscribed_at <= ${to}
          GROUP BY day
          ORDER BY day ASC
        `,
        db.$queryRaw<Array<{ type: string; count: bigint }>>`
          SELECT type, COUNT(*)::bigint AS count
          FROM tg_events
          WHERE bot_id = ${botId}
            AND occurred_at >= ${from}
            AND occurred_at <= ${to}
          GROUP BY type
          ORDER BY count DESC
          LIMIT 10
        `,
        db.$queryRaw<Array<{ slug: string; count: bigint }>>`
          SELECT first_touch_slug AS slug, COUNT(*)::bigint AS count
          FROM tg_subscribers
          WHERE bot_id = ${botId}
            AND first_touch_slug IS NOT NULL
            AND subscribed_at >= ${from}
            AND subscribed_at <= ${to}
          GROUP BY first_touch_slug
          ORDER BY count DESC
          LIMIT 5
        `,
      ]);

      // Pre-compute cumulative subscribers at the start of the period
      // so the growth line is correct (not just deltas).
      const startCumulative = await db.tgSubscriber.count({
        where: { botId, subscribedAt: { lt: from } },
      });

      // Fill missing days inside the period so the chart has a
      // continuous x-axis.
      const growth: Array<{ date: string; cumulative: number; new: number }> = [];
      const byDay = new Map<string, number>();
      for (const row of growthRows) {
        byDay.set(new Date(row.day).toISOString().slice(0, 10), Number(row.new_count));
      }
      const dayMs = 24 * 3600 * 1000;
      const start = new Date(
        Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate())
      );
      const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));
      let cumulative = startCumulative;
      for (let d = start.getTime(); d <= end.getTime(); d += dayMs) {
        const dStr = new Date(d).toISOString().slice(0, 10);
        const n = byDay.get(dStr) ?? 0;
        cumulative += n;
        growth.push({ date: dStr, cumulative, new: n });
      }

      return NextResponse.json(
        {
          success: true,
          data: {
            kpis: {
              totalSubscribers,
              activeWeek,
              newInPeriod,
              sentInPeriod,
              receivedInPeriod,
              blocked,
              conversionToPayment: null,
            },
            growth,
            topEvents: topEvents.map((r) => ({ type: r.type, count: Number(r.count) })),
            topSources: topSourcesRaw.map((r) => ({
              slug: r.slug,
              count: Number(r.count),
            })),
            period: {
              from: from.toISOString(),
              to: to.toISOString(),
              label: period.label,
            },
          },
        },
        { headers: { "Cache-Control": CACHE_HEADER } }
      );
    },
    { roles: ["admin"] }
  );
}

// Reference to keep Prisma import used in editor-driven future tweaks.
void Prisma;
