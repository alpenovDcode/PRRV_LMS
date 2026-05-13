"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { retentionBgClass } from "@/lib/tg/analytics/colors";

type Metric = "active" | "messaged" | "notblocked";

interface CohortResp {
  cohorts: Array<{ weekStart: string; size: number; weeks: Array<number | null> }>;
  metric: Metric;
  followWeeks: number;
}

export default function CohortsPage() {
  const params = useParams<{ botId: string }>();
  const botId = params.botId;
  const [metric, setMetric] = useState<Metric>("active");

  const { data, isLoading } = useQuery({
    queryKey: ["tg-analytics-cohorts", botId, metric],
    queryFn: async () => {
      const r = await apiClient.get(`/admin/tg/bots/${botId}/analytics/cohorts`, {
        params: { metric },
      });
      return r.data?.data as CohortResp;
    },
  });

  const follow = data?.followWeeks ?? 8;
  const cohorts = data?.cohorts ?? [];
  const empty = !isLoading && cohorts.every((c) => c.size === 0);

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 py-3 text-xs">
          <span className="text-muted-foreground">Метрика:</span>
          <div className="flex rounded-md border">
            {[
              { v: "active" as Metric, label: "Получено от юзера" },
              { v: "messaged" as Metric, label: "Доставлено" },
              { v: "notblocked" as Metric, label: "Не заблокировал" },
            ].map((o, i) => (
              <button
                key={o.v}
                onClick={() => setMetric(o.v)}
                className={`px-3 py-1 ${i > 0 ? "border-l" : ""} ${
                  metric === o.v
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Удержание по неделям</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="grid h-32 place-items-center text-sm text-muted-foreground">
              Загрузка…
            </div>
          ) : empty || !cohorts.length ? (
            <div className="grid h-32 place-items-center text-sm text-muted-foreground">
              Когорт ещё нет — подписчики не пришли
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Неделя</th>
                    <th className="px-3 py-2 font-medium text-right">Размер</th>
                    {Array.from({ length: follow }, (_, i) => (
                      <th key={i} className="px-3 py-2 font-medium text-center">
                        W{i}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cohorts.map((c) => (
                    <tr key={c.weekStart} className="border-b last:border-0">
                      <td className="px-3 py-1.5 font-mono">
                        {c.weekStart.slice(0, 10)}
                      </td>
                      <td className="px-3 py-1.5 text-right font-medium">{c.size}</td>
                      {c.weeks.map((v, i) => (
                        <td key={i} className="p-0.5">
                          <div
                            className={`grid h-8 place-items-center rounded text-[11px] ${retentionBgClass(
                              v
                            )}`}
                          >
                            {v == null ? "—" : `${v.toFixed(1)}%`}
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
