"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { usePeriodParams } from "@/components/admin/tg/analytics/use-period-params";
import { StatCard } from "@/components/admin/tg/analytics/stat-card";

interface ChannelRow {
  id: string;
  chatId: string;
  title: string;
  username: string | null;
  type: string;
  isActive: boolean;
  baselineCount: number;
  joinedInPeriod: number;
  leftInPeriod: number;
  membersTracked: number;
  netInPeriod: number;
  inviteLinks: Array<{
    id: string;
    name: string;
    inviteUrl: string;
    utm: Record<string, string>;
    joinCountTotal: number;
    joinsInPeriod: number;
    revoked: boolean;
  }>;
}

interface ChannelsResp {
  rows: ChannelRow[];
  totals: {
    joinedInPeriod: number;
    leftInPeriod: number;
    netInPeriod: number;
    membersTracked: number;
  };
}

export default function ChannelsAnalyticsPage() {
  const params = useParams<{ botId: string }>();
  const botId = params.botId;
  const periodParams = usePeriodParams();

  const { data, isLoading } = useQuery({
    queryKey: ["tg-analytics-channels", botId, periodParams],
    queryFn: async () => {
      const r = await apiClient.get(`/admin/tg/bots/${botId}/analytics/channels`, {
        params: periodParams,
      });
      return r.data?.data as ChannelsResp;
    },
  });

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Вступило" value={data?.totals.joinedInPeriod ?? "—"} />
        <StatCard label="Вышло" value={data?.totals.leftInPeriod ?? "—"} />
        <StatCard
          label="Чистый прирост"
          value={
            data?.totals.netInPeriod === undefined
              ? "—"
              : data.totals.netInPeriod > 0
              ? `+${data.totals.netInPeriod}`
              : data.totals.netInPeriod
          }
        />
        <StatCard
          label="Сейчас (учтённых)"
          value={data?.totals.membersTracked ?? "—"}
        />
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="grid h-32 place-items-center text-sm text-muted-foreground">
            Загрузка…
          </CardContent>
        </Card>
      ) : !data?.rows?.length ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Ни одного канала не подключено. Перейдите в раздел «Каналы» в
            настройках бота, чтобы добавить.
          </CardContent>
        </Card>
      ) : (
        data.rows.map((c) => (
          <Card key={c.id}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <CardTitle className="text-base">
                    {c.title}
                    {!c.isActive && (
                      <Badge variant="secondary" className="ml-2 text-[10px]">
                        выключен
                      </Badge>
                    )}
                  </CardTitle>
                  <div className="text-xs text-muted-foreground">
                    {c.username ? `@${c.username} · ` : ""}
                    {c.type} · baseline {c.baselineCount}
                  </div>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <div>
                    <span className="font-semibold text-emerald-600">
                      +{c.joinedInPeriod}
                    </span>{" "}
                    /{" "}
                    <span className="font-semibold text-rose-600">
                      −{c.leftInPeriod}
                    </span>
                  </div>
                  <div>сейчас (учтённых): {c.membersTracked}</div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {!c.inviteLinks.length ? (
                <div className="text-xs text-muted-foreground">
                  Трекинг-ссылок нет. Создайте именные invite-link'и в
                  настройках канала — Telegram будет возвращать их имя при
                  вступлении.
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="py-1 pr-2 font-medium">Ссылка</th>
                      <th className="py-1 pr-2 font-medium">UTM</th>
                      <th className="py-1 pr-2 font-medium text-right">За период</th>
                      <th className="py-1 pr-2 font-medium text-right">Всего</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.inviteLinks.map((l) => (
                      <tr key={l.id} className="border-b last:border-0">
                        <td className="py-1 pr-2">
                          <span className="font-mono text-xs">{l.name}</span>
                          {l.revoked && (
                            <Badge variant="secondary" className="ml-2 text-[10px]">
                              отозвана
                            </Badge>
                          )}
                        </td>
                        <td className="py-1 pr-2 text-xs text-muted-foreground">
                          {Object.entries(l.utm ?? {})
                            .map(([k, v]) => `${k}=${v}`)
                            .join(" · ")}
                        </td>
                        <td className="py-1 pr-2 text-right">{l.joinsInPeriod}</td>
                        <td className="py-1 pr-2 text-right text-muted-foreground">
                          {l.joinCountTotal}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
