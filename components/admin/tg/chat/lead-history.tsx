"use client";

// Вкладка «История» карточки лида: где сейчас в воронке, журнал всех
// прохождений сценариев и единый таймлайн событий.

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { MapPin, ChevronDown, ChevronRight } from "lucide-react";
import {
  describeEvent,
  formatAbsolute,
  formatDate,
  formatDuration,
  formatTime,
  relativeFromNow,
  statusBadgeVariant,
  flowRunStatusLabel,
  type DossierData,
} from "./lead-helpers";

interface Props {
  botId: string;
  subscriberId: string;
}

// Типы событий, которые в полном таймлайне обычно шумят. По умолчанию
// прячем пошаговое исполнение нод — раскрывается тумблером.
const NOISY = new Set(["flow.node_executed"]);

export function LeadHistory({ botId, subscriberId }: Props) {
  const [showNoisy, setShowNoisy] = useState(false);
  const [eventsExpanded, setEventsExpanded] = useState(true);

  const { data, isLoading } = useQuery({
    queryKey: ["tg-dossier", botId, subscriberId],
    queryFn: async () => {
      const r = await apiClient.get(
        `/admin/tg/bots/${botId}/subscribers/${subscriberId}/dossier`
      );
      return r.data?.data as DossierData;
    },
    refetchInterval: 30_000,
  });

  const visibleEvents = useMemo(() => {
    const all = data?.events ?? [];
    return showNoisy ? all : all.filter((e) => !NOISY.has(e.type));
  }, [data?.events, showNoisy]);

  if (isLoading) {
    return <div className="p-4 text-sm text-zinc-400">Загрузка истории…</div>;
  }
  if (!data) {
    return <div className="p-4 text-sm text-zinc-400">Нет данных</div>;
  }

  return (
    <div className="space-y-5 text-sm">
      {/* 1. Текущая позиция в воронке */}
      <section className="space-y-1.5">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          Текущая позиция
        </Label>
        {data.position ? (
          <div className="rounded border border-purple-200 bg-purple-50/50 px-2.5 py-2">
            <div className="flex items-center gap-1.5 font-medium text-purple-900">
              <MapPin className="h-3.5 w-3.5" />
              {data.position.flowName}
            </div>
            <div className="mt-0.5 font-mono text-[11px] text-purple-700">
              нода: {data.position.nodeId ?? "—"}
            </div>
            {data.position.at && (
              <div className="text-[10px] text-purple-600">
                вошёл {relativeFromNow(data.position.at)}
              </div>
            )}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">
            Сейчас не в позиционной ноде ни одной воронки.
          </div>
        )}
      </section>

      {/* 2. Журнал прохождения воронок */}
      <section className="space-y-1.5">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          Журнал сценариев ({data.flowRuns.length})
        </Label>
        {data.flowRuns.length === 0 ? (
          <div className="text-xs text-muted-foreground">
            Подписчик ещё не проходил ни одной воронки.
          </div>
        ) : (
          <div className="space-y-1.5">
            {data.flowRuns.map((r) => (
              <div
                key={r.id}
                className="rounded border border-zinc-200 px-2.5 py-1.5"
                title={r.lastError ?? undefined}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{r.flowName}</span>
                  <Badge
                    variant={statusBadgeVariant(r.status)}
                    className="shrink-0 text-[10px]"
                  >
                    {flowRunStatusLabel(r.status)}
                  </Badge>
                </div>
                <div className="mt-0.5 flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>{formatDate(r.startedAt)}</span>
                  <span>
                    {r.durationSec != null
                      ? `длился ${formatDuration(r.durationSec)}`
                      : r.currentNodeId
                        ? `на ноде ${r.currentNodeId}`
                        : ""}
                  </span>
                </div>
                {r.lastError && (
                  <div className="mt-0.5 truncate text-[10px] text-red-600">
                    {r.lastError}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 3. Единый таймлайн событий */}
      <section className="space-y-1.5">
        <button
          type="button"
          onClick={() => setEventsExpanded((v) => !v)}
          className="flex w-full items-center gap-1 text-xs uppercase tracking-wide text-muted-foreground hover:text-foreground"
        >
          {eventsExpanded ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
          Таймлайн событий ({visibleEvents.length})
        </button>
        {eventsExpanded && (
          <>
            <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <input
                type="checkbox"
                checked={showNoisy}
                onChange={(e) => setShowNoisy(e.target.checked)}
              />
              Показывать пошаговое исполнение нод
            </label>
            {visibleEvents.length === 0 ? (
              <div className="text-xs text-muted-foreground">Событий нет</div>
            ) : (
              <ol className="relative space-y-0 border-l border-zinc-200 pl-4">
                {visibleEvents.map((e) => {
                  const d = describeEvent(e);
                  return (
                    <li
                      key={e.id}
                      className="relative py-1.5"
                      title={`${e.type} · ${formatAbsolute(e.occurredAt)}`}
                    >
                      <span className="absolute -left-[1.32rem] top-2 text-[11px]">
                        {d.icon}
                      </span>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-xs leading-snug">{d.text}</span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {formatTime(e.occurredAt)}
                        </span>
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {formatDate(e.occurredAt)}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </>
        )}
      </section>
    </div>
  );
}
