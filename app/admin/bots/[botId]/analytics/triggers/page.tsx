"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { usePeriodParams } from "@/components/admin/tg/analytics/use-period-params";
import { AlertTriangle, Zap, Skull } from "lucide-react";

interface TriggerStatsResp {
  byType: Array<{ type: string; fired: number; subs: number }>;
  byFlow: Array<{
    id: string;
    name: string;
    isActive: boolean;
    totalFired: number;
    totalSubs: number;
    byType: Array<{ type: string; fired: number; subs: number }>;
    configuredTriggers: Array<{ type: string; label: string }>;
    deadTriggerTypes: string[];
  }>;
}

const TRIGGER_TYPE_LABEL: Record<string, string> = {
  command: "/команда",
  keyword: "ключевое слово",
  regex: "regex",
  subscribed: "первый /start",
  tracking_link: "tracking link",
  default_start: "default /start",
  button_callback: "кнопка callback",
  goto_flow: "goto_flow",
  bulk_action: "bulk action",
  scheduled_flow: "scheduled flow",
  manual_api: "manual / API",
  unknown: "неизвестно",
};

function trigTypeLabel(t: string) {
  return TRIGGER_TYPE_LABEL[t] ?? t;
}

export default function TriggerStatsPage() {
  const params = useParams<{ botId: string }>();
  const botId = params.botId;
  const period = usePeriodParams();

  const { data, isLoading } = useQuery({
    queryKey: ["tg-trigger-stats", botId, period],
    queryFn: async () => {
      const r = await apiClient.get(
        `/admin/tg/bots/${botId}/analytics/triggers`,
        { params: period }
      );
      return r.data?.data as TriggerStatsResp;
    },
  });

  const totalFired = data?.byType.reduce((s, t) => s + t.fired, 0) ?? 0;
  const maxFired = Math.max(1, ...(data?.byType.map((t) => t.fired) ?? [1]));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-600" />
            По типу триггера
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Загрузка…</div>
          ) : !data?.byType.length ? (
            <div className="text-sm text-muted-foreground">
              Триггеры не срабатывали в выбранном периоде.
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">
                Всего срабатываний:{" "}
                <span className="font-mono">{totalFired.toLocaleString("ru-RU")}</span>
              </div>
              {data.byType.map((row) => {
                const widthPct = (row.fired / maxFired) * 100;
                return (
                  <div key={row.type} className="space-y-0.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{trigTypeLabel(row.type)}</span>
                      <span className="flex gap-3 text-xs">
                        <span className="text-muted-foreground">
                          уник.подп.: <span className="font-mono">{row.subs}</span>
                        </span>
                        <span className="font-mono font-medium">{row.fired}</span>
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-amber-500"
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
          <CardTitle className="text-base">По сценариям</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Загрузка…</div>
          ) : !data?.byFlow.length ? (
            <div className="text-sm text-muted-foreground">
              Сценариев нет.
            </div>
          ) : (
            data.byFlow.map((f) => (
              <div key={f.id} className="rounded border p-3 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="font-medium">
                    {f.name}
                    {!f.isActive && (
                      <span className="ml-2 text-[10px] text-muted-foreground">(off)</span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Всего: <span className="font-mono">{f.totalFired}</span> запусков,{" "}
                    <span className="font-mono">{f.totalSubs}</span> уник.
                  </div>
                </div>

                {f.byType.length === 0 ? (
                  <div className="text-xs text-amber-700 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    В этот период никто не запустил флоу.
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {f.byType.map((t) => (
                      <Badge
                        key={t.type}
                        variant="secondary"
                        className="text-[11px] font-mono"
                      >
                        {trigTypeLabel(t.type)}: {t.fired}
                      </Badge>
                    ))}
                  </div>
                )}

                {f.configuredTriggers.length > 0 && (
                  <div className="text-[11px] text-muted-foreground">
                    Сконфигурировано:{" "}
                    {f.configuredTriggers.map((t, i) => (
                      <span
                        key={`${t.type}-${i}`}
                        className={
                          f.deadTriggerTypes.includes(t.type)
                            ? "text-red-600 font-medium"
                            : ""
                        }
                      >
                        {trigTypeLabel(t.type)}
                        {t.label && (
                          <span className="font-mono ml-0.5">({t.label})</span>
                        )}
                        {i < f.configuredTriggers.length - 1 ? ", " : ""}
                      </span>
                    ))}
                  </div>
                )}

                {f.deadTriggerTypes.length > 0 && (
                  <div className="text-[11px] text-red-700 flex items-center gap-1">
                    <Skull className="h-3 w-3" />
                    Мёртвые: {f.deadTriggerTypes.map(trigTypeLabel).join(", ")}
                    {" — сконфигурированы, но не сработали ни разу."}
                  </div>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
