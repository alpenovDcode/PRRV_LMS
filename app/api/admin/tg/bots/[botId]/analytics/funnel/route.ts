import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-middleware";
import { parsePeriod } from "@/lib/tg/analytics/period";
import { orderFunnelNodes } from "@/lib/tg/analytics/funnel-order";
import type { FlowGraph } from "@/lib/tg/flow-schema";

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
      const flowId = url.searchParams.get("flowId");
      if (!flowId) {
        return NextResponse.json(
          { success: false, error: { code: "BAD_REQUEST", message: "flowId is required" } },
          { status: 400 }
        );
      }
      const period = parsePeriod({
        period: url.searchParams.get("period"),
        from: url.searchParams.get("from"),
        to: url.searchParams.get("to"),
      });

      const flow = await db.tgFlow.findFirst({
        where: { id: flowId, botId },
      });
      if (!flow) {
        return NextResponse.json(
          { success: false, error: { code: "NOT_FOUND", message: "Flow not found" } },
          { status: 404 }
        );
      }

      // The engine guarantees the stored shape; we trust the type
      // (per spec we don't re-validate).
      const graph = flow.graph as unknown as FlowGraph;
      const ordered = orderFunnelNodes(graph);

      // Per-node distinct subscribers from `flow.node_executed`.
      const counts = await db.$queryRaw<
        Array<{ node_id: string; subs: bigint }>
      >`
        SELECT
          (properties->>'nodeId') AS node_id,
          COUNT(DISTINCT subscriber_id)::bigint AS subs
        FROM tg_events
        WHERE bot_id = ${botId}
          AND type = 'flow.node_executed'
          AND properties->>'flowId' = ${flowId}
          AND occurred_at >= ${period.from}
          AND occurred_at <= ${period.to}
          AND subscriber_id IS NOT NULL
        GROUP BY node_id
      `;
      const byNode = new Map<string, number>();
      for (const r of counts) byNode.set(r.node_id, Number(r.subs));

      // Average time-in-node: for each (subscriber, this node), take
      // the next `flow.node_executed` row for the same subscriber+flow
      // (any node, ordered by occurredAt) and compute the gap. The
      // median across subscribers smooths out outliers.
      const timeRows = await db.$queryRaw<
        Array<{ node_id: string; avg_sec: number | null }>
      >`
        WITH events AS (
          SELECT
            id,
            subscriber_id,
            properties->>'nodeId' AS node_id,
            occurred_at,
            LEAD(occurred_at) OVER (
              PARTITION BY subscriber_id, properties->>'flowId'
              ORDER BY occurred_at
            ) AS next_at
          FROM tg_events
          WHERE bot_id = ${botId}
            AND type = 'flow.node_executed'
            AND properties->>'flowId' = ${flowId}
            AND occurred_at >= ${period.from}
            AND occurred_at <= ${period.to}
            AND subscriber_id IS NOT NULL
        )
        SELECT
          node_id,
          PERCENTILE_DISC(0.5) WITHIN GROUP (
            ORDER BY EXTRACT(EPOCH FROM (next_at - occurred_at))
          )::float AS avg_sec
        FROM events
        WHERE next_at IS NOT NULL
        GROUP BY node_id
      `;
      const timeByNode = new Map<string, number | null>();
      for (const r of timeRows) timeByNode.set(r.node_id, r.avg_sec);

      const nodes: Array<{
        nodeId: string;
        nodeType: string;
        label: string;
        depth: number;
        count: number;
        dropFromPrev: number;
        dropPercentFromPrev: number;
        avgTimeInNodeSec: number | null;
      }> = [];

      let prevCount: number | null = null;
      let entered = 0;
      for (const n of ordered) {
        const count = byNode.get(n.nodeId) ?? 0;
        if (entered === 0) entered = count; // first node executed = entered count
        const dropFromPrev = prevCount == null ? 0 : Math.max(0, prevCount - count);
        const dropPercentFromPrev =
          prevCount && prevCount > 0 ? Math.round((dropFromPrev / prevCount) * 1000) / 10 : 0;
        nodes.push({
          nodeId: n.nodeId,
          nodeType: n.nodeType,
          label: n.label,
          depth: n.depth,
          count,
          dropFromPrev,
          dropPercentFromPrev,
          avgTimeInNodeSec: timeByNode.get(n.nodeId) ?? null,
        });
        prevCount = count;
      }

      // Worst step = biggest drop in absolute terms (only among nodes
      // that had a previous step to drop from).
      let worstNodeId: string | null = null;
      let worstDrop = 0;
      for (const n of nodes.slice(1)) {
        if (n.dropFromPrev > worstDrop) {
          worstDrop = n.dropFromPrev;
          worstNodeId = n.nodeId;
        }
      }

      return NextResponse.json(
        {
          success: true,
          data: {
            flow: {
              id: flow.id,
              name: flow.name,
              isActive: flow.isActive,
              startNodeId: graph.startNodeId,
            },
            entered,
            nodes,
            worstNodeId,
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
