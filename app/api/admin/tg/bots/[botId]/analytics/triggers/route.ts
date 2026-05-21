import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-middleware";
import { parsePeriod } from "@/lib/tg/analytics/period";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Триггер-статистика: на чём флоу реально запускаются и где «мертвечина».
//
// Источник — события `flow.entered`. У каждого срабатывания мы пишем
// properties.triggerType: command, keyword, regex, subscribed,
// tracking_link, default_start, button_callback, goto_flow, bulk_action,
// scheduled_flow, manual_api, и т.д.
//
// Возвращаем:
//   • byType[]   — глобально по типу триггера (сколько и уник.подписч.)
//   • byFlow[]   — по флоу: суммарно вошедших, по типам триггеров,
//                  и список «дохлых» триггеров (сконфигурированы, но
//                  ни разу не сработали в окне)
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

      // 1) Глобально по типу.
      const byTypeRows = await db.$queryRaw<
        Array<{ trigger_type: string; fired: bigint; subs: bigint }>
      >`
        SELECT
          COALESCE(properties->>'triggerType', 'unknown') AS trigger_type,
          COUNT(*)::bigint AS fired,
          COUNT(DISTINCT subscriber_id)::bigint AS subs
        FROM tg_events
        WHERE bot_id = ${botId}
          AND type = 'flow.entered'
          AND occurred_at >= ${period.from}
          AND occurred_at <= ${period.to}
        GROUP BY trigger_type
        ORDER BY fired DESC
      `;

      // 2) По флоу × типу триггера.
      const byFlowTypeRows = await db.$queryRaw<
        Array<{
          flow_id: string;
          trigger_type: string;
          fired: bigint;
          subs: bigint;
        }>
      >`
        SELECT
          (properties->>'flowId') AS flow_id,
          COALESCE(properties->>'triggerType', 'unknown') AS trigger_type,
          COUNT(*)::bigint AS fired,
          COUNT(DISTINCT subscriber_id)::bigint AS subs
        FROM tg_events
        WHERE bot_id = ${botId}
          AND type = 'flow.entered'
          AND properties->>'flowId' IS NOT NULL
          AND occurred_at >= ${period.from}
          AND occurred_at <= ${period.to}
        GROUP BY 1, 2
      `;

      // 3) Достаём все флоу с их триггерами — нужно сравнить
      //    сконфигурированные триггеры с фактически сработавшими.
      const flows = await db.tgFlow.findMany({
        where: { botId },
        select: { id: true, name: true, isActive: true, triggers: true },
      });

      // Map flow → { type → {fired, subs} }
      const flowStats = new Map<
        string,
        Map<string, { fired: number; subs: number }>
      >();
      for (const r of byFlowTypeRows) {
        if (!flowStats.has(r.flow_id)) flowStats.set(r.flow_id, new Map());
        flowStats
          .get(r.flow_id)!
          .set(r.trigger_type, {
            fired: Number(r.fired),
            subs: Number(r.subs),
          });
      }

      const byFlow = flows.map((f) => {
        const stats = flowStats.get(f.id) ?? new Map();
        const totalFired = Array.from(stats.values()).reduce(
          (s, v) => s + v.fired,
          0
        );
        const totalSubs = Array.from(stats.values()).reduce(
          (s, v) => s + v.subs,
          0
        );
        const triggersArr = Array.isArray(f.triggers)
          ? (f.triggers as Array<{ type: string; [k: string]: unknown }>)
          : [];
        const configuredTypes = triggersArr.map((t) => t.type ?? "unknown");
        // Сконфигурированные, которые ни разу не сработали.
        const dead = configuredTypes.filter((t) => !stats.has(t));
        return {
          id: f.id,
          name: f.name,
          isActive: f.isActive,
          totalFired,
          totalSubs,
          byType: Array.from(stats.entries()).map(([type, v]) => ({
            type,
            fired: v.fired,
            subs: v.subs,
          })),
          configuredTriggers: triggersArr.map((t) => ({
            type: String(t.type ?? "unknown"),
            // Простое человекочитаемое описание: для keyword — слова,
            // для command — команда, для regex — паттерн.
            label: triggerLabel(t),
          })),
          deadTriggerTypes: Array.from(new Set(dead)),
        };
      });

      byFlow.sort((a, b) => b.totalFired - a.totalFired);

      return NextResponse.json(
        {
          success: true,
          data: {
            period: {
              from: period.from.toISOString(),
              to: period.to.toISOString(),
              label: period.label,
            },
            byType: byTypeRows.map((r) => ({
              type: r.trigger_type,
              fired: Number(r.fired),
              subs: Number(r.subs),
            })),
            byFlow,
          },
        },
        {
          headers: {
            "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
          },
        }
      );
    },
    { roles: ["admin"] }
  );
}

function triggerLabel(t: Record<string, unknown>): string {
  switch (t.type) {
    case "command":
      return `/${String(t.command ?? "")}`;
    case "keyword":
      return Array.isArray(t.keywords)
        ? (t.keywords as unknown[]).slice(0, 3).join(", ")
        : "";
    case "regex":
      return String(t.pattern ?? "");
    case "subscribed":
      return "первый /start";
    default:
      return String(t.type ?? "");
  }
}
