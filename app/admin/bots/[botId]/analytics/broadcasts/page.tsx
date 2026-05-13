"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/admin/tg/analytics/stat-card";
import { usePeriodParams } from "@/components/admin/tg/analytics/use-period-params";

interface BroadcastsResp {
  kpis: { avgDeliveryRate: number; avgClickRate: number; avgUnsubscribeAfter: number };
  rows: Array<{
    id: string;
    name: string;
    status: string;
    startedAt: string | null;
    recipients: number;
    delivered: number;
    read: number | null;
    clicks: number;
    unsubscribesAfter: number;
    revenue: number;
  }>;
}

export default function BroadcastsAnalyticsPage() {
  const params = useParams<{ botId: string }>();
  const botId = params.botId;
  const periodParams = usePeriodParams();

  const { data, isLoading } = useQuery({
    queryKey: ["tg-analytics-broadcasts", botId, periodParams],
    queryFn: async () => {
      const r = await apiClient.get(`/admin/tg/bots/${botId}/analytics/broadcasts`, {
        params: periodParams,
      });
      return r.data?.data as BroadcastsResp;
    },
  });

  const k = data?.kpis;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          label="Средняя доставка"
          value={k ? `${k.avgDeliveryRate.toFixed(1)}%` : "—"}
        />
        <StatCard
          label="Средний CTR"
          value={k ? `${k.avgClickRate.toFixed(1)}%` : "—"}
        />
        <StatCard
          label="Отписок после рассылки"
          value={k ? `${k.avgUnsubscribeAfter.toFixed(1)}%` : "—"}
          hint="В течение 24ч после отправки"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Рассылки</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="grid h-32 place-items-center text-sm text-muted-foreground">
              Загрузка…
            </div>
          ) : !data?.rows?.length ? (
            <div className="grid h-32 place-items-center text-sm text-muted-foreground">
              За выбранный период рассылок не было
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Название</th>
                  <th className="px-4 py-2 font-medium">Статус</th>
                  <th className="px-4 py-2 font-medium">Старт</th>
                  <th className="px-4 py-2 font-medium text-right">Получатели</th>
                  <th className="px-4 py-2 font-medium">Доставка</th>
                  <th className="px-4 py-2 font-medium text-right">Клики</th>
                  <th className="px-4 py-2 font-medium text-right">Отписки</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => {
                  const conv =
                    r.recipients > 0 ? (r.delivered / r.recipients) * 100 : 0;
                  return (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="px-4 py-2">{r.name}</td>
                      <td className="px-4 py-2">
                        <Badge variant="outline" className="text-[10px] uppercase">
                          {r.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">
                        {r.startedAt ? new Date(r.startedAt).toLocaleString("ru-RU") : "—"}
                      </td>
                      <td className="px-4 py-2 text-right">{r.recipients}</td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-full max-w-32 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-emerald-500"
                              style={{ width: `${conv}%` }}
                            />
                          </div>
                          <span className="w-16 text-xs text-muted-foreground">
                            {r.delivered}/{r.recipients} ({conv.toFixed(0)}%)
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right">
                        {r.clicks > 0 ? r.clicks : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {r.unsubscribesAfter > 0 ? (
                          <span className="text-red-600">{r.unsubscribesAfter}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
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
