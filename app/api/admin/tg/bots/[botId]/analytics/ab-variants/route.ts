import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-middleware";
import { parsePeriod } from "@/lib/tg/analytics/period";
import type { FlowGraph, FlowNode } from "@/lib/tg/flow-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Funnel-level A/B breakdown.
//
// Каждая split-нода во флоу — отдельный «эксперимент». Для каждого
// эксперимента возвращаем перформанс веток: сколько подписчиков прошли
// через каждую ветку и сколько из них дошли до `flow.completed`.
//
// Логика:
//   1. Из `tg_events` берём все события `flow.ab_split` для (botId, flowId)
//      в заданном периоде, группируем по nodeId+variant → entered.
//   2. Для каждой (nodeId+variant) считаем уникальных подписчиков, у
//      которых после события ab_split (по occurredAt) есть событие
//      `flow.completed` для того же flowId.
//   3. conversionRate = completed/entered * 100.
//
// Возвращаем массив экспериментов; UI рисует bar-chart с верхним и
// нижним вариантом подсвеченным.
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

      const flow = await db.tgFlow.findFirst({ where: { id: flowId, botId } });
      if (!flow) {
        return NextResponse.json(
          { success: false, error: { code: "NOT_FOUND", message: "Flow not found" } },
          { status: 404 }
        );
      }

      const graph = flow.graph as unknown as FlowGraph;
      const splitNodes: Array<Extract<FlowNode, { type: "split" }>> = graph.nodes.filter(
        (n): n is Extract<FlowNode, { type: "split" }> => n.type === "split"
      );

      if (splitNodes.length === 0) {
        return NextResponse.json(
          {
            success: true,
            data: {
              flow: { id: flow.id, name: flow.name },
              experiments: [],
              period: {
                from: period.from.toISOString(),
                to: period.to.toISOString(),
                label: period.label,
              },
            },
          },
          { headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=60" } }
        );
      }

      // Entered per (nodeId, variant).
      const enteredRows = await db.$queryRaw<
        Array<{ node_id: string; variant: string; subs: bigint }>
      >`
        SELECT
          properties->>'nodeId' AS node_id,
          properties->>'variant' AS variant,
          COUNT(DISTINCT subscriber_id)::bigint AS subs
        FROM tg_events
        WHERE bot_id = ${botId}
          AND type = 'flow.ab_split'
          AND properties->>'flowId' = ${flowId}
          AND occurred_at >= ${period.from}
          AND occurred_at <= ${period.to}
          AND subscriber_id IS NOT NULL
        GROUP BY node_id, variant
      `;

      // Completed per (nodeId, variant): joined via subscriber_id who fired
      // both ab_split and a later flow.completed for the same flow.
      const completedRows = await db.$queryRaw<
        Array<{ node_id: string; variant: string; subs: bigint }>
      >`
        SELECT
          s.node_id,
          s.variant,
          COUNT(DISTINCT s.subscriber_id)::bigint AS subs
        FROM (
          SELECT
            subscriber_id,
            properties->>'nodeId' AS node_id,
            properties->>'variant' AS variant,
            occurred_at AS split_at
          FROM tg_events
          WHERE bot_id = ${botId}
            AND type = 'flow.ab_split'
            AND properties->>'flowId' = ${flowId}
            AND occurred_at >= ${period.from}
            AND occurred_at <= ${period.to}
            AND subscriber_id IS NOT NULL
        ) s
        JOIN tg_events c
          ON c.bot_id = ${botId}
         AND c.type = 'flow.completed'
         AND c.properties->>'flowId' = ${flowId}
         AND c.subscriber_id = s.subscriber_id
         AND c.occurred_at >= s.split_at
        WHERE c.occurred_at <= ${period.to}
        GROUP BY s.node_id, s.variant
      `;

      const enteredMap = new Map<string, number>();
      for (const r of enteredRows) {
        enteredMap.set(`${r.node_id}::${r.variant}`, Number(r.subs));
      }
      const completedMap = new Map<string, number>();
      for (const r of completedRows) {
        completedMap.set(`${r.node_id}::${r.variant}`, Number(r.subs));
      }

      const experiments = splitNodes.map((node) => {
        const variants = node.branches.map((b) => {
          const key = `${node.id}::${b.label}`;
          const entered = enteredMap.get(key) ?? 0;
          const completed = completedMap.get(key) ?? 0;
          const conversionRate =
            entered > 0 ? Math.round((completed / entered) * 1000) / 10 : 0;
          return {
            label: b.label,
            weight: b.weight,
            entered,
            completed,
            conversionRate,
          };
        });
        const totalEntered = variants.reduce((s, v) => s + v.entered, 0);
        const sorted = [...variants].sort((a, b) => b.conversionRate - a.conversionRate);
        const winner =
          totalEntered > 0 && sorted.length > 0 && sorted[0].conversionRate > 0
            ? sorted[0].label
            : null;
        return {
          nodeId: node.id,
          nodeLabel: node.label ?? "A/B split",
          totalEntered,
          variants,
          winner,
        };
      });

      return NextResponse.json(
        {
          success: true,
          data: {
            flow: { id: flow.id, name: flow.name },
            experiments,
            period: {
              from: period.from.toISOString(),
              to: period.to.toISOString(),
              label: period.label,
            },
          },
        },
        { headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=60" } }
      );
    },
    { roles: ["admin"] }
  );
}
