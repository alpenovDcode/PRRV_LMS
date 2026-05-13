import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-middleware";
import { parsePeriod } from "@/lib/tg/analytics/period";
import {
  aggregateLinkBuckets,
  bucketKeyForLink,
  isProblematic,
  type AttributionGroupBy,
} from "@/lib/tg/analytics/attribution";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_HEADER = "private, max-age=30, stale-while-revalidate=60";

type Attribution = "first" | "last";

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
      const attribution: Attribution =
        url.searchParams.get("attribution") === "last" ? "last" : "first";
      const groupByParam = url.searchParams.get("groupBy");
      const groupBy: AttributionGroupBy =
        groupByParam === "campaign" || groupByParam === "slug" ? groupByParam : "source";

      const period = parsePeriod({
        period: url.searchParams.get("period"),
        from: url.searchParams.get("from"),
        to: url.searchParams.get("to"),
      });
      const weekAgo = new Date(period.to.getTime() - 7 * 24 * 3600 * 1000);

      // Step 1: every tracking link for the bot — used both for click
      // totals and to know which slug maps to which UTM bucket.
      const links = await db.tgTrackingLink.findMany({
        where: { botId },
        select: { slug: true, utm: true, clickCount: true },
      });

      // Step 2: bucket the links so we can map slugs → bucket key in O(1)
      // and produce the click totals per bucket.
      const linkAggregates = aggregateLinkBuckets(
        links.map((l) => ({
          slug: l.slug,
          utm: (l.utm ?? {}) as Record<string, unknown>,
          clickCount: l.clickCount,
        })),
        groupBy
      );

      // Step 3: count attributed subscribers per bucket inside the period.
      // We use raw SQL to do the join in one shot rather than pulling
      // every subscriber into Node memory.
      const touchField = attribution === "first" ? "first_touch_slug" : "last_touch_slug";
      const touchAtField = attribution === "first" ? "first_touch_at" : "last_touch_at";

      // For groupBy=slug we can count straight in SQL; for source/campaign
      // we have to do the bucketing in Node because the bucket key
      // depends on the link's UTM JSON.
      const attributedPerSlug = await db.$queryRawUnsafe<
        Array<{ slug: string | null; subs: bigint; actives: bigint }>
      >(
        `
        SELECT
          ${touchField} AS slug,
          COUNT(*)::bigint AS subs,
          SUM(CASE WHEN last_seen_at >= $1 THEN 1 ELSE 0 END)::bigint AS actives
        FROM tg_subscribers
        WHERE bot_id = $2
          AND ${touchAtField} >= $3
          AND ${touchAtField} <= $4
        GROUP BY ${touchField}
        `,
        weekAgo,
        botId,
        period.from,
        period.to
      );

      // Build slug -> {subs, actives}
      const subsBySlug = new Map<string | null, { subs: number; actives: number }>();
      for (const r of attributedPerSlug) {
        subsBySlug.set(r.slug, { subs: Number(r.subs), actives: Number(r.actives) });
      }

      // Build slug -> bucket key (using same logic the click-aggregation used).
      const slugToKey = new Map<string, string>();
      for (const l of links) {
        slugToKey.set(
          l.slug,
          bucketKeyForLink(
            { slug: l.slug, utm: (l.utm ?? {}) as Record<string, unknown>, clickCount: l.clickCount },
            groupBy
          )
        );
      }

      // Merge attributed subscriber counts into the link-bucket map.
      const rowMap = new Map<
        string,
        { key: string; clicks: number; subscribed: number; active: number }
      >();
      // Pre-seed every link bucket so zero-subscribed but ever-clicked links still appear.
      for (const [key, agg] of linkAggregates.entries()) {
        rowMap.set(key, { key, clicks: agg.clicks, subscribed: 0, active: 0 });
      }
      // Add attribution counts.
      for (const [slug, counts] of subsBySlug.entries()) {
        const bucketKey = slug ? slugToKey.get(slug) ?? "unknown" : "organic";
        const cur = rowMap.get(bucketKey) ?? {
          key: bucketKey,
          clicks: 0,
          subscribed: 0,
          active: 0,
        };
        cur.subscribed += counts.subs;
        cur.active += counts.actives;
        rowMap.set(bucketKey, cur);
      }

      const rows = Array.from(rowMap.values())
        .map((r) => ({
          key: r.key,
          clicks: r.clicks,
          subscribed: r.subscribed,
          active: r.active,
          paid: 0,
          revenue: 0,
          flagProblematic: isProblematic(r.clicks, r.subscribed),
        }))
        .sort((a, b) => b.subscribed - a.subscribed || b.clicks - a.clicks);

      const totals = {
        clicks: rows.reduce((a, r) => a + r.clicks, 0),
        subscribed: rows.reduce((a, r) => a + r.subscribed, 0),
        active: rows.reduce((a, r) => a + r.active, 0),
        paid: 0,
        revenue: 0,
      };

      // Pick best (highest subscribed conv where clicks > 0) and worst (flagged).
      let bestKey: string | null = null;
      let bestConv = -1;
      for (const r of rows) {
        if (r.clicks > 0) {
          const conv = r.subscribed / r.clicks;
          if (conv > bestConv) {
            bestConv = conv;
            bestKey = r.key;
          }
        }
      }
      const problematic = rows.find((r) => r.flagProblematic)?.key ?? null;

      return NextResponse.json(
        {
          success: true,
          data: {
            rows,
            totals,
            insights: { bestKey, problematicKey: problematic },
            attribution,
            groupBy,
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
