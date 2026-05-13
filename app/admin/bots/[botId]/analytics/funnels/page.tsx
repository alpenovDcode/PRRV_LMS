"use client";

import { useParams } from "next/navigation";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, TrendingDown } from "lucide-react";
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

  const entered = funnel.data?.entered ?? 0;
  const maxCount = Math.max(1, ...(funnel.data?.nodes?.map((n) => n.count) ?? [1]));
  const worst = funnel.data?.nodes.find((n) => n.nodeId === funnel.data?.worstNodeId);

  return (
    <div className="space-y-6">
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
    </div>
  );
}
