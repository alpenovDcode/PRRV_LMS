import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-middleware";
import { parsePeriod } from "@/lib/tg/analytics/period";
import type { FlowGraph } from "@/lib/tg/flow-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Funnel-summary — кросс-флоу обзор. Возвращает по каждому флоу:
//   entered  — уникальные подписчики, у которых fired `flow.node_executed`
//              на startNode внутри окна
//   completed — уникальные, у кого fired `flow.completed` внутри окна
//   conversionRate — completed / entered * 100
//   medianTimeSec — медиана длины run’а (от первого node_executed до
//                   completed) для тех, кто дошёл
//
// Сортировка: по умолчанию по убыванию entered, чтобы топовые воронки
// были сверху.
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

      const flows = await db.tgFlow.findMany({
        where: { botId },
        select: { id: true, name: true, isActive: true, graph: true },
        orderBy: { updatedAt: "desc" },
      });

      if (flows.length === 0) {
        return NextResponse.json(
          {
            success: true,
            data: {
              flows: [],
              totals: { entered: 0, completed: 0, conversionRate: 0 },
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

      // entered = distinct subscribers who fired `flow.node_executed` on
      // the startNode of the flow.
      const flowStartMap = new Map<string, string>();
      for (const f of flows) {
        const g = f.graph as unknown as FlowGraph;
        if (g && typeof g === "object" && g.startNodeId) {
          flowStartMap.set(f.id, g.startNodeId);
        }
      }

      // Entered = distinct subscribers whose `flow.node_executed` hit each
      // flow’s startNode. Querying per-flow keeps the SQL simple — bots
      // typically have <50 flows so this is cheap.
      const enteredMap = new Map<string, number>();
      await Promise.all(
        flows.map(async (f) => {
          const startId = flowStartMap.get(f.id);
          if (!startId) return;
          const r = await db.$queryRaw<Array<{ subs: bigint }>>`
            SELECT COUNT(DISTINCT subscriber_id)::bigint AS subs
            FROM tg_events
            WHERE bot_id = ${botId}
              AND type = 'flow.node_executed'
              AND properties->>'flowId' = ${f.id}
              AND properties->>'nodeId' = ${startId}
              AND occurred_at >= ${period.from}
              AND occurred_at <= ${period.to}
              AND subscriber_id IS NOT NULL
          `;
          enteredMap.set(f.id, Number(r[0]?.subs ?? 0));
        })
      );

      const completedRows = await db.$queryRaw<
        Array<{ flow_id: string; subs: bigint }>
      >`
        SELECT
          properties->>'flowId' AS flow_id,
          COUNT(DISTINCT subscriber_id)::bigint AS subs
        FROM tg_events
        WHERE bot_id = ${botId}
          AND type = 'flow.completed'
          AND occurred_at >= ${period.from}
          AND occurred_at <= ${period.to}
          AND subscriber_id IS NOT NULL
        GROUP BY flow_id
      `;
      const completedMap = new Map<string, number>();
      for (const r of completedRows) completedMap.set(r.flow_id, Number(r.subs));

      // Median time-to-completion (in seconds) — длина «дошедших».
      const medianRows = await db.$queryRaw<
        Array<{ flow_id: string; med: number | null }>
      >`
        WITH runs AS (
          SELECT
            (e1.properties->>'flowId') AS flow_id,
            e1.subscriber_id,
            MIN(e1.occurred_at) AS started_at,
            MIN(e2.occurred_at) AS completed_at
          FROM tg_events e1
          JOIN tg_events e2
            ON e2.bot_id = e1.bot_id
           AND e2.type = 'flow.completed'
           AND e2.properties->>'flowId' = e1.properties->>'flowId'
           AND e2.subscriber_id = e1.subscriber_id
           AND e2.occurred_at >= e1.occurred_at
           AND e2.occurred_at <= ${period.to}
          WHERE e1.bot_id = ${botId}
            AND e1.type = 'flow.node_executed'
            AND e1.occurred_at >= ${period.from}
            AND e1.occurred_at <= ${period.to}
            AND e1.subscriber_id IS NOT NULL
          GROUP BY 1, 2
        )
        SELECT
          flow_id,
          PERCENTILE_DISC(0.5) WITHIN GROUP (
            ORDER BY EXTRACT(EPOCH FROM (completed_at - started_at))
          )::float AS med
        FROM runs
        WHERE completed_at IS NOT NULL
        GROUP BY flow_id
      `;
      const medianMap = new Map<string, number | null>();
      for (const r of medianRows) medianMap.set(r.flow_id, r.med);

      const result = flows.map((f) => {
        const entered = enteredMap.get(f.id) ?? 0;
        const completed = completedMap.get(f.id) ?? 0;
        const conversionRate =
          entered > 0 ? Math.round((completed / entered) * 1000) / 10 : 0;
        const medianSec = medianMap.get(f.id) ?? null;
        return {
          id: f.id,
          name: f.name,
          isActive: f.isActive,
          entered,
          completed,
          conversionRate,
          medianTimeSec: medianSec,
        };
      });

      result.sort((a, b) => b.entered - a.entered);

      const totalEntered = result.reduce((s, r) => s + r.entered, 0);
      const totalCompleted = result.reduce((s, r) => s + r.completed, 0);
      const totalConv =
        totalEntered > 0
          ? Math.round((totalCompleted / totalEntered) * 1000) / 10
          : 0;

      return NextResponse.json(
        {
          success: true,
          data: {
            flows: result,
            totals: {
              entered: totalEntered,
              completed: totalCompleted,
              conversionRate: totalConv,
            },
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
