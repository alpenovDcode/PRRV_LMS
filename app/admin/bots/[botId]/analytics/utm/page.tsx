"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Trophy } from "lucide-react";
import { usePeriodParams } from "@/components/admin/tg/analytics/use-period-params";
import { StatCard } from "@/components/admin/tg/analytics/stat-card";

type Attribution = "first" | "last";
type GroupBy = "source" | "campaign" | "slug";

interface UtmResp {
  rows: Array<{
    key: string;
    clicks: number;
    subscribed: number;
    active: number;
    paid: number;
    revenue: number;
    flagProblematic: boolean;
  }>;
  totals: { clicks: number; subscribed: number; active: number; paid: number; revenue: number };
  insights: { bestKey: string | null; problematicKey: string | null };
}

export default function UtmPage() {
  const params = useParams<{ botId: string }>();
  const botId = params.botId;
  const periodParams = usePeriodParams();
  const [attribution, setAttribution] = useState<Attribution>("first");
  const [groupBy, setGroupBy] = useState<GroupBy>("source");

  const { data, isLoading } = useQuery({
    queryKey: ["tg-analytics-utm", botId, attribution, groupBy, periodParams],
    queryFn: async () => {
      const r = await apiClient.get(`/admin/tg/bots/${botId}/analytics/utm`, {
        params: { attribution, groupBy, ...periodParams },
      });
      return r.data?.data as UtmResp;
    },
  });

  const best = data?.rows.find((r) => r.key === data.insights.bestKey);
  const worst = data?.rows.find((r) => r.key === data.insights.problematicKey);

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-wrap gap-4 py-3 text-xs">
          <Toggle
            label="Атрибуция"
            value={attribution}
            onChange={(v) => setAttribution(v as Attribution)}
            options={[
              { value: "first", label: "Первое касание" },
              { value: "last", label: "Последнее касание" },
            ]}
          />
          <Toggle
            label="Группировка"
            value={groupBy}
            onChange={(v) => setGroupBy(v as GroupBy)}
            options={[
              { value: "source", label: "Источник" },
              { value: "campaign", label: "Кампания" },
              { value: "slug", label: "Slug" },
            ]}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Клики" value={data?.totals.clicks ?? "—"} />
        <StatCard label="Подписки" value={data?.totals.subscribed ?? "—"} />
        <StatCard label="Активные (7д)" value={data?.totals.active ?? "—"} />
        <StatCard label="Конв. clicks→subs" value={
          data?.totals.clicks
            ? `${((data.totals.subscribed / data.totals.clicks) * 100).toFixed(1)}%`
            : "—"
        } />
      </div>

      {(best || worst) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {best && best.clicks > 0 && (
            <Card className="border-emerald-400 bg-emerald-50/60 dark:bg-emerald-950/30">
              <CardContent className="flex items-start gap-3 py-4">
                <Trophy className="mt-0.5 h-5 w-5 text-emerald-600" />
                <div className="space-y-1">
                  <div className="text-sm font-medium">Лучший источник</div>
                  <div className="text-xs text-muted-foreground">
                    «{best.key}» — {best.subscribed} подписок из {best.clicks} кликов (
                    {((best.subscribed / Math.max(1, best.clicks)) * 100).toFixed(1)}%)
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
          {worst && (
            <Card className="border-amber-400 bg-amber-50/60 dark:bg-amber-950/30">
              <CardContent className="flex items-start gap-3 py-4">
                <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-600" />
                <div className="space-y-1">
                  <div className="text-sm font-medium">Проблемный источник</div>
                  <div className="text-xs text-muted-foreground">
                    «{worst.key}» — конверсия в подписку{" "}
                    {((worst.subscribed / Math.max(1, worst.clicks)) * 100).toFixed(1)}% при{" "}
                    {worst.clicks} кликах.
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Источники</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="grid h-32 place-items-center text-sm text-muted-foreground">
              Загрузка…
            </div>
          ) : !data?.rows?.length ? (
            <div className="grid h-32 place-items-center text-sm text-muted-foreground">
              Нет трекинговых ссылок и переходов за период
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Ключ</th>
                  <th className="px-4 py-2 font-medium text-right">Клики</th>
                  <th className="px-4 py-2 font-medium text-right">Подписки</th>
                  <th className="px-4 py-2 font-medium">Конв. clicks→subs</th>
                  <th className="px-4 py-2 font-medium text-right">Активные</th>
                  <th className="px-4 py-2 font-medium text-right">Оплат</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => {
                  const conv =
                    r.clicks > 0 ? Math.min(100, (r.subscribed / r.clicks) * 100) : 0;
                  return (
                    <tr key={r.key} className="border-b last:border-0">
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs">{r.key}</span>
                          {r.flagProblematic && (
                            <Badge variant="secondary" className="text-[10px]">
                              требует внимания
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right">{r.clicks}</td>
                      <td className="px-4 py-2 text-right">{r.subscribed}</td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-full max-w-32 overflow-hidden rounded-full bg-muted">
                            <div
                              className={`h-full rounded-full ${
                                conv >= 30 ? "bg-emerald-500" : "bg-purple-500"
                              }`}
                              style={{ width: `${conv}%` }}
                            />
                          </div>
                          <span className="w-12 text-xs text-muted-foreground">
                            {conv.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right">{r.active}</td>
                      <td className="px-4 py-2 text-right text-muted-foreground">—</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Toggle<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string }>;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground">{label}:</span>
      <div className="flex rounded-md border">
        {options.map((o, i) => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`px-3 py-1 text-xs ${
              i > 0 ? "border-l" : ""
            } ${
              value === o.value
                ? "bg-primary/10 text-primary font-medium"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
