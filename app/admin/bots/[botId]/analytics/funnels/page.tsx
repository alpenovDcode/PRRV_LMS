"use client";

import { useParams } from "next/navigation";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Trophy, TrendingDown } from "lucide-react";
import { usePeriodParams } from "@/components/admin/tg/analytics/use-period-params";
import { humanizeSeconds } from "@/lib/tg/analytics/colors";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface FlowsListResp {
  flows: Array<{
    id: string;
    name: string;
    isActive: boolean;
    totalEntered: number;
    totalCompleted: number;
  }>;
}

interface FunnelSummaryResp {
  flows: Array<{
    id: string;
    name: string;
    isActive: boolean;
    entered: number;
    completed: number;
    conversionRate: number;
    medianTimeSec: number | null;
  }>;
  totals: { entered: number; completed: number; conversionRate: number };
}

interface AbVariantsResp {
  experiments: Array<{
    nodeId: string;
    nodeLabel: string;
    totalEntered: number;
    winner: string | null;
    variants: Array<{
      label: string;
      weight: number;
      entered: number;
      completed: number;
      conversionRate: number;
    }>;
  }>;
}

interface FunnelResp {
  flow: { id: string; name: string; isActive: boolean; startNodeId: string };
  entered: number;
  nodes: Array<{
    nodeId: string;
    nodeType: string;
    label: string;
    depth: number;
    count: number;
    dropFromPrev: number;
    dropPercentFromPrev: number;
    avgTimeInNodeSec: number | null;
  }>;
  worstNodeId: string | null;
}

export default function FunnelsPage() {
  const params = useParams<{ botId: string }>();
  const botId = params.botId;
  const periodParams = usePeriodParams();
  const [flowId, setFlowId] = useState<string | null>(null);

  const flows = useQuery({
    queryKey: ["tg-analytics-flows", botId],
    queryFn: async () => {
      const r = await apiClient.get(`/admin/tg/bots/${botId}/analytics/flows-list`);
      return r.data?.data as FlowsListResp;
    },
  });

  useEffect(() => {
    if (!flowId && flows.data?.flows?.length) setFlowId(flows.data.flows[0].id);
  }, [flowId, flows.data]);

  const funnel = useQuery({
    queryKey: ["tg-analytics-funnel", botId, flowId, periodParams],
    queryFn: async () => {
      const r = await apiClient.get(`/admin/tg/bots/${botId}/analytics/funnel`, {
        params: { flowId: flowId!, ...periodParams },
      });
      return r.data?.data as FunnelResp;
    },
    enabled: !!flowId,
  });

  const summary = useQuery({
    queryKey: ["tg-analytics-funnel-summary", botId, periodParams],
    queryFn: async () => {
      const r = await apiClient.get(
        `/admin/tg/bots/${botId}/analytics/funnel-summary`,
        { params: periodParams }
      );
      return r.data?.data as FunnelSummaryResp;
    },
  });

  const ab = useQuery({
    queryKey: ["tg-analytics-ab-variants", botId, flowId, periodParams],
    queryFn: async () => {
      const r = await apiClient.get(
        `/admin/tg/bots/${botId}/analytics/ab-variants`,
        { params: { flowId: flowId!, ...periodParams } }
      );
      return r.data?.data as AbVariantsResp;
    },
    enabled: !!flowId,
  });

  const entered = funnel.data?.entered ?? 0;
  const maxCount = Math.max(1, ...(funnel.data?.nodes?.map((n) => n.count) ?? [1]));
  const worst = funnel.data?.nodes.find((n) => n.nodeId === funnel.data?.worstNodeId);

  return (
    <div className="space-y-6">
      {summary.data && summary.data.flows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Сводка по флоу за период «{summary.data.flows.length ? "" : ""}
              {(summary.data as unknown as { period?: { label?: string } })?.period?.label ?? ""}»
              <span className="ml-2 text-xs text-muted-foreground font-normal">
                Всего {summary.data.totals.entered} вошли, {summary.data.totals.completed} завершили (
                {summary.data.totals.conversionRate}%)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-2 pr-4 font-medium">Флоу</th>
                    <th className="py-2 px-2 font-medium text-right">Вошли</th>
                    <th className="py-2 px-2 font-medium text-right">Завершили</th>
                    <th className="py-2 px-2 font-medium text-right">Conversion</th>
                    <th className="py-2 px-2 font-medium text-right">Медиана</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.data.flows.map((f) => {
                    const isSelected = f.id === flowId;
                    const lowConv = f.entered >= 10 && f.conversionRate < 30;
                    return (
                      <tr
                        key={f.id}
                        className={`border-b last:border-0 cursor-pointer hover:bg-muted/40 ${
                          isSelected ? "bg-primary/5" : ""
                        }`}
                        onClick={() => setFlowId(f.id)}
                      >
                        <td className="py-2 pr-4">
                          <span className={isSelected ? "font-medium" : ""}>{f.name}</span>
                          {!f.isActive && (
                            <span className="ml-2 text-[10px] text-muted-foreground">(off)</span>
                          )}
                        </td>
                        <td className="py-2 px-2 text-right font-mono">{f.entered}</td>
                        <td className="py-2 px-2 text-right font-mono">{f.completed}</td>
                        <td
                          className={`py-2 px-2 text-right font-mono ${
                            lowConv ? "text-red-600 font-medium" : ""
                          }`}
                        >
                          {f.conversionRate}%
                        </td>
                        <td className="py-2 px-2 text-right text-xs text-muted-foreground">
                          {f.medianTimeSec != null ? humanizeSeconds(f.medianTimeSec) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Сценарий</CardTitle>
        </CardHeader>
        <CardContent>
          {!flows.data?.flows?.length ? (
            <div className="text-sm text-muted-foreground">Сценариев пока нет.</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {flows.data.flows.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFlowId(f.id)}
                  className={`rounded-full border px-3 py-1 text-xs ${
                    flowId === f.id
                      ? "border-primary bg-primary/10 text-primary font-medium"
                      : "border-input text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {f.name}
                  {!f.isActive && <span className="ml-1 text-muted-foreground">(off)</span>}
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {worst && worst.dropFromPrev > 0 && (
        <Card className="border-amber-400 bg-amber-50/60 dark:bg-amber-950/30">
          <CardContent className="flex items-start gap-3 py-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-600" />
            <div className="space-y-1">
              <div className="text-sm font-medium">Самая большая утечка</div>
              <div className="text-xs text-muted-foreground">
                Шаг «{worst.label}»: потеряно {worst.dropFromPrev} пользователей (
                {worst.dropPercentFromPrev}% от предыдущего).
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Шаги воронки</CardTitle>
        </CardHeader>
        <CardContent>
          {funnel.isLoading ? (
            <div className="grid h-32 place-items-center text-sm text-muted-foreground">
              Загрузка…
            </div>
          ) : !funnel.data?.nodes?.length ? (
            <div className="grid h-32 place-items-center text-sm text-muted-foreground">
              Нет данных по сценарию
            </div>
          ) : (
            <div className="space-y-2">
              {funnel.data.nodes.map((n, i) => {
                const pctOfEntered = entered > 0 ? (n.count / entered) * 100 : 0;
                const widthPct = (n.count / maxCount) * 100;
                const showDrop = i > 0 && n.dropFromPrev > 0;
                const dropAlarm = n.dropPercentFromPrev > 5;
                return (
                  <div key={n.nodeId} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="font-mono text-[10px] uppercase">
                          {n.nodeType}
                        </Badge>
                        <span className="truncate" title={n.label}>
                          {n.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        {showDrop && (
                          <span
                            className={`flex items-center gap-1 text-xs ${
                              dropAlarm ? "text-red-600 font-medium" : "text-muted-foreground"
                            }`}
                          >
                            <TrendingDown className="h-3 w-3" />
                            −{n.dropFromPrev} ({n.dropPercentFromPrev}%)
                          </span>
                        )}
                        <span className="font-medium">{n.count}</span>
                        <span className="w-12 text-right text-xs text-muted-foreground">
                          {pctOfEntered.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                    <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-purple-600"
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Среднее время на шаге</CardTitle>
        </CardHeader>
        <CardContent className="h-64">
          {!funnel.data?.nodes?.length ? (
            <div className="grid h-full place-items-center text-sm text-muted-foreground">
              Нет данных
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={funnel.data.nodes.map((n) => ({
                  name: n.label.length > 20 ? n.label.slice(0, 20) + "…" : n.label,
                  sec: n.avgTimeInNodeSec ?? 0,
                  human: humanizeSeconds(n.avgTimeInNodeSec),
                }))}
              >
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="name" fontSize={10} interval={0} angle={-15} textAnchor="end" height={60} />
                <YAxis
                  fontSize={10}
                  tickFormatter={(v) => humanizeSeconds(v as number)}
                />
                <Tooltip
                  formatter={(value: number) => [humanizeSeconds(value), "Среднее"]}
                />
                <Bar dataKey="sec" fill="#a78bfa" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {ab.data && ab.data.experiments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Trophy className="h-4 w-4 text-pink-600" />
              A/B-эксперименты
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {ab.data.experiments.map((exp) => {
              const maxConv = Math.max(1, ...exp.variants.map((v) => v.conversionRate || 0));
              return (
                <div key={exp.nodeId} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">{exp.nodeLabel}</div>
                    <div className="text-xs text-muted-foreground">
                      {exp.totalEntered} вошли в эксперимент
                    </div>
                  </div>
                  {exp.totalEntered === 0 ? (
                    <div className="text-xs text-muted-foreground italic">
                      Нет данных в выбранном периоде.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {exp.variants.map((v) => {
                        const isWinner = exp.winner === v.label;
                        const widthPct =
                          v.conversionRate > 0 ? (v.conversionRate / maxConv) * 100 : 0;
                        return (
                          <div key={v.label} className="space-y-1">
                            <div className="flex items-center justify-between text-sm">
                              <div className="flex items-center gap-2">
                                <Badge
                                  variant={isWinner ? "default" : "outline"}
                                  className="font-mono text-[10px]"
                                >
                                  {v.label}
                                </Badge>
                                {isWinner && (
                                  <Trophy className="h-3 w-3 text-amber-500" />
                                )}
                                <span className="text-xs text-muted-foreground">
                                  weight={v.weight}
                                </span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-xs text-muted-foreground">
                                  {v.entered} вошли · {v.completed} завершили
                                </span>
                                <span className="font-mono font-medium">
                                  {v.conversionRate}%
                                </span>
                              </div>
                            </div>
                            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                              <div
                                className={`h-full rounded-full ${
                                  isWinner ? "bg-pink-600" : "bg-pink-300"
                                }`}
                                style={{ width: `${widthPct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
            <div className="text-[10px] text-muted-foreground">
              Conversion рассчитывается как доля подписчиков, прошедших ветку и затем
              достигших <code>flow.completed</code>. Для статистической значимости
              нужно ≥50–100 подписчиков на ветку.
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
