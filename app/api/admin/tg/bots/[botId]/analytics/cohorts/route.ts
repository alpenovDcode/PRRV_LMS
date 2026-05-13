import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-middleware";
import {
  buildRetentionGrid,
  isoWeekStartUTC,
  lastNIsoWeeks,
} from "@/lib/tg/analytics/cohort";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_HEADER = "private, max-age=30, stale-while-revalidate=60";
const WEEKS = 12;
const FOLLOW_WEEKS = 8;

type Metric = "active" | "messaged" | "notblocked";

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
      const metricParam = url.searchParams.get("metric");
      const metric: Metric =
        metricParam === "messaged" || metricParam === "notblocked" ? metricParam : "active";

      const now = new Date();
      const currentWeek = isoWeekStartUTC(now);
      const cohorts = lastNIsoWeeks(currentWeek, WEEKS);
      const oldestCohortStart = cohorts[0];

      // Pull every subscriber created since the oldest cohort.
      const subs = await db.tgSubscriber.findMany({
        where: { botId, subscribedAt: { gte: oldestCohortStart } },
        select: { id: true, subscribedAt: true, isBlocked: true, unsubscribedAt: true },
      });

      // Bucket subscribers into their cohort week (key = ISO string of week start).
      const members = new Map<string, Set<string>>();
      for (const c of cohorts) members.set(c.toISOString(), new Set());
      const subWeekMap = new Map<string, string>(); // subId -> cohort week ISO
      for (const s of subs) {
        const weekStart = isoWeekStartUTC(s.subscribedAt);
        const key = weekStart.toISOString();
        const set = members.get(key);
        if (set) {
          set.add(s.id);
          subWeekMap.set(s.id, key);
        }
      }

      // Now build the qualifying-event timeline based on `metric`.
      // We only need events for subscribers in our cohorts.
      const subIds = Array.from(subWeekMap.keys());

      let events: Array<{ subscriberId: string; occurredAt: Date }> = [];

      if (subIds.length > 0) {
        if (metric === "active") {
          const rows = await db.tgMessage.findMany({
            where: {
              botId,
              direction: "in",
              subscriberId: { in: subIds },
              createdAt: { gte: oldestCohortStart },
            },
            select: { subscriberId: true, createdAt: true },
          });
          events = rows.map((r) => ({ subscriberId: r.subscriberId, occurredAt: r.createdAt }));
        } else if (metric === "messaged") {
          const rows = await db.tgMessage.findMany({
            where: {
              botId,
              direction: "out",
              subscriberId: { in: subIds },
              createdAt: { gte: oldestCohortStart },
            },
            select: { subscriberId: true, createdAt: true },
          });
          events = rows.map((r) => ({ subscriberId: r.subscriberId, occurredAt: r.createdAt }));
        } else if (metric === "notblocked") {
          // "Not blocked" by week N: subscriber is currently not blocked
          // OR unsubscribedAt is after the end of week N. To express
          // that as an event-based check, we synthesize an "active"
          // event at the end of every week the subscriber is still in.
          // We use unsubscribedAt as the cutoff (or now if still active).
          const WEEK_MS = 7 * 24 * 3600 * 1000;
          for (const s of subs) {
            const cutoff = s.isBlocked
              ? s.unsubscribedAt?.getTime() ?? s.subscribedAt.getTime()
              : now.getTime();
            const start = isoWeekStartUTC(s.subscribedAt).getTime();
            for (let w = 0; w < FOLLOW_WEEKS; w++) {
              const winEnd = start + (w + 1) * WEEK_MS;
              if (winEnd - 1 <= cutoff && start + w * WEEK_MS <= now.getTime()) {
                events.push({
                  subscriberId: s.id,
                  occurredAt: new Date(start + w * WEEK_MS + WEEK_MS / 2),
                });
              }
            }
          }
        }
      }

      const grid = buildRetentionGrid({
        now,
        cohorts,
        members,
        events,
        maxWeeks: FOLLOW_WEEKS,
      });

      return NextResponse.json(
        {
          success: true,
          data: {
            cohorts: grid,
            metric,
            followWeeks: FOLLOW_WEEKS,
          },
        },
        { headers: { "Cache-Control": CACHE_HEADER } }
      );
    },
    { roles: ["admin"] }
  );
}
