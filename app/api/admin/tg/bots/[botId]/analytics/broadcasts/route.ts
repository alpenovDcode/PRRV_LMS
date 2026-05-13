import { NextRequest, NextResponse } from "next/server";
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

      const broadcasts = await db.tgBroadcast.findMany({
        where: {
          botId,
          OR: [
            { startedAt: { gte: period.from, lte: period.to } },
            { createdAt: { gte: period.from, lte: period.to } },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      });

      const ids = broadcasts.map((b) => b.id);

      // Click and unsubscribe events. We pull the broadcast-tagged ones
      // and let the client aggregate per id. For unsubscribes we look
      // at `subscriber.blocked_bot` events within 24h of a recipient's
      // `sentAt`.
      const clickRows = ids.length
        ? await db.$queryRaw<Array<{ source_id: string; clicks: bigint }>>`
            SELECT properties->>'sourceId' AS source_id, COUNT(*)::bigint AS clicks
            FROM tg_events
            WHERE bot_id = ${botId}
              AND type = 'button.clicked'
              AND properties->>'sourceType' = 'broadcast'
              AND properties->>'sourceId' = ANY(${ids})
            GROUP BY source_id
          `
        : [];
      const clicksById = new Map<string, number>();
      for (const r of clickRows) clicksById.set(r.source_id, Number(r.clicks));

      // Unsubscribes-within-24h-of-send. We can compute this purely in
      // SQL by joining recipients to blocked-bot events with a window.
      const unsubRows = ids.length
        ? await db.$queryRaw<Array<{ broadcast_id: string; unsubs: bigint }>>`
            SELECT r.broadcast_id, COUNT(DISTINCT r.subscriber_id)::bigint AS unsubs
            FROM tg_broadcast_recipients r
            JOIN tg_events e
              ON e.subscriber_id = r.subscriber_id
             AND e.type = 'subscriber.blocked_bot'
             AND e.occurred_at >= r.sent_at
             AND e.occurred_at < r.sent_at + INTERVAL '24 hours'
            WHERE r.broadcast_id = ANY(${ids})
              AND r.sent_at IS NOT NULL
            GROUP BY r.broadcast_id
          `
        : [];
      const unsubsById = new Map<string, number>();
      for (const r of unsubRows) unsubsById.set(r.broadcast_id, Number(r.unsubs));

      const rows = broadcasts.map((b) => {
        const recipients = b.totalRecipients;
        const delivered = b.sentCount;
        const clicks = clicksById.get(b.id) ?? 0;
        const unsubscribesAfter = unsubsById.get(b.id) ?? 0;
        return {
          id: b.id,
          name: b.name,
          status: b.status,
          startedAt: b.startedAt?.toISOString() ?? null,
          recipients,
          delivered,
          read: null,
          clicks,
          unsubscribesAfter,
          revenue: 0,
        };
      });

      // KPI averages (across broadcasts that actually started).
      const started = rows.filter((r) => r.recipients > 0);
      const avgDeliveryRate = started.length
        ? started.reduce((a, r) => a + r.delivered / r.recipients, 0) / started.length
        : 0;
      const clickable = started.filter((r) => r.delivered > 0);
      const avgClickRate = clickable.length
        ? clickable.reduce((a, r) => a + r.clicks / r.delivered, 0) / clickable.length
        : 0;
      const avgUnsubscribeAfter = started.length
        ? started.reduce((a, r) => a + r.unsubscribesAfter / Math.max(1, r.delivered), 0) /
          started.length
        : 0;

      return NextResponse.json(
        {
          success: true,
          data: {
            kpis: {
              avgDeliveryRate: Math.round(avgDeliveryRate * 1000) / 10,
              avgClickRate: Math.round(avgClickRate * 1000) / 10,
              avgUnsubscribeAfter: Math.round(avgUnsubscribeAfter * 1000) / 10,
            },
            rows,
            period: {
              from: period.from.toISOString(),
              to: period.to.toISOString(),
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
