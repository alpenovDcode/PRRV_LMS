"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/admin/tg/analytics/stat-card";
import { usePeriodParams } from "@/components/admin/tg/analytics/use-period-params";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";

interface OverviewResp {
  kpis: {
    totalSubscribers: number;
    activeWeek: number;
    newInPeriod: number;
    sentInPeriod: number;
    receivedInPeriod: number;
    blocked: number;
    conversionToPayment: number | null;
  };
  growth: Array<{ date: string; cumulative: number; new: number }>;
  topEvents: Array<{ type: string; count: number }>;
  topSources: Array<{ slug: string; count: number }>;
  period: { from: string; to: string; label: string };
}

export default function AnalyticsOverviewPage() {
  const params = useParams<{ botId: string }>();
  const botId = params.botId;
  const periodParams = usePeriodParams();

  const { data, isLoading, error } = useQuery({
    queryKey: ["tg-analytics-overview", botId, periodParams],
    queryFn: async () => {
      const r = await apiClient.get(`/admin/tg/bots/${botId}/analytics/overview`, {
        params: periodParams,
      });
      return r.data?.data as OverviewResp;
    },
  });

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Не удалось загрузить аналитику
        </CardContent>
      </Card>
    );
  }

  const k = data?.kpis;

  const maxSource = Math.max(1, ...(data?.topSources?.map((s) => s.count) ?? [1]));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Подписчиков всего" value={k?.totalSubscribers ?? "—"} />
        <StatCard label="Активны за 7д" value={k?.activeWeek ?? "—"} />
        <StatCard label="Новых в периоде" value={k?.newInPeriod ?? "—"} />
        <StatCard label="Сообщений из бота" value={k?.sentInPeriod ?? "—"} />
        <StatCard label="Сообщений в бот" value={k?.receivedInPeriod ?? "—"} />
        <StatCard label="Заблокировали" value={k?.blocked ?? "—"} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Рост базы подписчиков</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          {isLoading ? (
            <div className="grid h-full place-items-center text-sm text-muted-foreground">
              Загрузка…
            </div>
          ) : !data?.growth?.length ? (
            <EmptyState message="Нет данных за выбранный период" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data.growth}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="date" fontSize={11} />
                <YAxis yAxisId="left" fontSize={11} />
                <YAxis yAxisId="right" orientation="right" fontSize={11} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar
                  yAxisId="right"
                  dataKey="new"
                  fill="#a78bfa"
                  name="Новых за день"
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="cumulative"
                  stroke="#6d28d9"
                  strokeWidth={2}
                  dot={false}
                  name="Всего"
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Топ-события</CardTitle>
          </CardHeader>
          <CardContent>
            {!data?.topEvents?.length ? (
              <EmptyState message="Событий пока нет" />
            ) : (
              <div className="space-y-1.5">
                {data.topEvents.map((e) => (
                  <div
                    key={e.type}
                    className="flex items-center justify-between border-b py-1 text-sm last:border-0"
                  >
                    <span className="font-mono text-xs">{e.type}</span>
                    <span className="font-medium">{e.count.toLocaleString("ru-RU")}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Топ источников (новые подписчики)</CardTitle>
          </CardHeader>
          <CardContent>
            {!data?.topSources?.length ? (
              <EmptyState message="UTM-источников не зафиксировано" />
            ) : (
              <div className="space-y-2">
                {data.topSources.map((s) => (
                  <div key={s.slug} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-mono text-xs">{s.slug}</span>
                      <span className="font-medium">{s.count}</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-purple-500"
                        style={{ width: `${(s.count / maxSource) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="grid h-full min-h-32 place-items-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}
