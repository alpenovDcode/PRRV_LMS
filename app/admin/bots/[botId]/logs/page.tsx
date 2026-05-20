"use client";

// Страница «Логи» для бота. Показывает поток событий из tg_events,
// группированный по severity (Ошибки / Предупреждения / Инфо).
//
// Каждая запись раскрывается в карточку с полным JSON-properties —
// удобно для диагностики, когда «бот не отвечает» / «дожимы не уходят».

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, RefreshCw, FileText, AlertTriangle, AlertCircle, Info } from "lucide-react";
import Link from "next/link";

type Severity = "error" | "warn" | "info" | "debug";

interface LogItem {
  id: string;
  type: string;
  meta: {
    label: string;
    description: string;
    severity: Severity;
    icon: string;
  };
  subscriber: {
    id: string;
    chatId: string;
    name: string | null;
    username: string | null;
  } | null;
  properties: Record<string, unknown>;
  occurredAt: string;
}

interface LogsResponse {
  items: LogItem[];
  nextCursor: string | null;
  counts24h: Record<Severity, number>;
  severities: Severity[];
}

const SEVERITY_META: Record<Severity, { label: string; color: string; bg: string; Icon: typeof AlertCircle }> = {
  error: { label: "Ошибки", color: "text-rose-600", bg: "bg-rose-50 border-rose-200", Icon: AlertCircle },
  warn: { label: "Предупреждения", color: "text-amber-600", bg: "bg-amber-50 border-amber-200", Icon: AlertTriangle },
  info: { label: "Инфо", color: "text-blue-600", bg: "bg-blue-50 border-blue-200", Icon: Info },
  debug: { label: "Отладка", color: "text-zinc-500", bg: "bg-zinc-50 border-zinc-200", Icon: FileText },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.round(diff / 1000);
  if (sec < 60) return `${sec} сек назад`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} мин назад`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} ч назад`;
  const day = Math.round(hr / 24);
  return `${day} дн назад`;
}

export default function LogsPage() {
  const params = useParams<{ botId: string }>();
  const botId = params.botId;
  const [filter, setFilter] = useState<Severity[]>(["error", "warn"]);
  const [q, setQ] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [items, setItems] = useState<LogItem[]>([]);
  const [counts, setCounts] = useState<Record<Severity, number>>({
    error: 0,
    warn: 0,
    info: 0,
    debug: 0,
  });
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const severityParam = useMemo(() => filter.join(","), [filter]);

  const { isFetching, refetch } = useQuery({
    queryKey: ["tg-logs", botId, severityParam, q],
    queryFn: async () => {
      const url = `/admin/tg/bots/${botId}/logs?severity=${severityParam}${q ? `&q=${encodeURIComponent(q)}` : ""}&limit=50`;
      const r = await apiClient.get(url);
      const data = r.data?.data as LogsResponse;
      setItems(data.items);
      setNextCursor(data.nextCursor);
      setCounts(data.counts24h);
      return data;
    },
    refetchInterval: 30_000, // обновлять каждые 30 сек
  });

  // Auto-refresh при смене фильтра — react-query сам отработает через queryKey.

  const loadMore = async () => {
    if (!nextCursor) return;
    const url = `/admin/tg/bots/${botId}/logs?severity=${severityParam}${q ? `&q=${encodeURIComponent(q)}` : ""}&limit=50&cursor=${nextCursor}`;
    const r = await apiClient.get(url);
    const data = r.data?.data as LogsResponse;
    setItems((prev) => [...prev, ...data.items]);
    setNextCursor(data.nextCursor);
  };

  const toggleSeverity = (sev: Severity) => {
    setFilter((curr) =>
      curr.includes(sev) ? curr.filter((s) => s !== sev) : [...curr, sev]
    );
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-5 w-5" /> Журнал событий
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Поток того, что происходит в боте: ошибки отправки, упавшие
              сценарии, клики, регистрации. За последние 24 часа.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw
              className={`mr-1 h-3 w-3 ${isFetching ? "animate-spin" : ""}`}
            />
            Обновить
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Severity filter chips — кликаешь, фильтр toggles */}
          <div className="flex flex-wrap gap-2">
            {(["error", "warn", "info", "debug"] as Severity[]).map((sev) => {
              const meta = SEVERITY_META[sev];
              const active = filter.includes(sev);
              const Icon = meta.Icon;
              return (
                <button
                  key={sev}
                  onClick={() => toggleSeverity(sev)}
                  className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border transition ${
                    active
                      ? `${meta.bg} ${meta.color}`
                      : "bg-white border-zinc-200 text-zinc-500 hover:border-zinc-300"
                  }`}
                >
                  <Icon className="h-3 w-3" />
                  {meta.label}
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] ${active ? "bg-white/70" : "bg-zinc-100"}`}
                  >
                    {counts[sev] ?? 0}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Search */}
          <div>
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Поиск по типу события (например, send_failed, validation, http_request)"
              className="text-sm"
            />
          </div>
        </CardContent>
      </Card>

      {/* Список событий */}
      {isFetching && items.length === 0 && (
        <div className="text-sm text-muted-foreground italic p-6 text-center">
          Загружаю…
        </div>
      )}
      {!isFetching && items.length === 0 && (
        <div className="text-sm text-muted-foreground italic p-6 text-center bg-zinc-50 rounded border">
          Событий не найдено за выбранный период / фильтр. Если бот только
          что создан — это нормально, события появятся по мере работы.
        </div>
      )}
      <div className="space-y-1.5">
        {items.map((item) => {
          const sevMeta = SEVERITY_META[item.meta.severity];
          const expanded = expandedId === item.id;
          return (
            <Card
              key={item.id}
              className={`border-l-4 ${
                item.meta.severity === "error"
                  ? "border-l-rose-500"
                  : item.meta.severity === "warn"
                    ? "border-l-amber-500"
                    : "border-l-blue-300"
              }`}
            >
              <CardContent className="py-2.5 px-3">
                <button
                  onClick={() => setExpandedId(expanded ? null : item.id)}
                  className="flex items-start justify-between w-full text-left gap-3"
                >
                  <div className="flex items-start gap-2 min-w-0 flex-1">
                    <span className="text-lg shrink-0">{item.meta.icon}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">
                          {item.meta.label}
                        </span>
                        <Badge variant="secondary" className="text-[10px] font-mono">
                          {item.type}
                        </Badge>
                        {item.subscriber && (
                          <Link
                            href={`/admin/bots/${botId}/subscribers/${item.subscriber.id}`}
                            className={`text-[11px] underline ${sevMeta.color}`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {item.subscriber.name ||
                              (item.subscriber.username && `@${item.subscriber.username}`) ||
                              item.subscriber.chatId}
                          </Link>
                        )}
                      </div>
                      {/* Brief properties preview — первые 2-3 поля */}
                      <div className="text-[11px] text-zinc-500 mt-0.5 truncate font-mono">
                        {Object.entries(item.properties)
                          .slice(0, 3)
                          .map(([k, v]) => `${k}=${valueShort(v)}`)
                          .join(" · ")}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className="text-[10px] text-muted-foreground"
                      title={new Date(item.occurredAt).toLocaleString("ru-RU")}
                    >
                      {timeAgo(item.occurredAt)}
                    </span>
                    {expanded ? (
                      <ChevronDown className="h-4 w-4 text-zinc-400" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-zinc-400" />
                    )}
                  </div>
                </button>
                {expanded && (
                  <div className="mt-3 space-y-2 pl-7 border-t pt-3">
                    {item.meta.description && (
                      <p className="text-xs text-zinc-600">
                        <span className="font-medium">Что значит:</span>{" "}
                        {item.meta.description}
                      </p>
                    )}
                    <div>
                      <div className="text-[10px] uppercase text-zinc-500 mb-1">
                        Полные данные события
                      </div>
                      <pre className="text-[11px] font-mono bg-zinc-50 rounded p-2 overflow-x-auto border border-zinc-200">
                        {JSON.stringify(item.properties, null, 2)}
                      </pre>
                    </div>
                    <div className="text-[10px] text-zinc-400">
                      Точное время: {new Date(item.occurredAt).toLocaleString("ru-RU")} ·
                      ID события: <code>{item.id}</code>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {nextCursor && (
        <div className="text-center py-4">
          <Button variant="outline" size="sm" onClick={loadMore} disabled={isFetching}>
            Загрузить ещё
          </Button>
        </div>
      )}
    </div>
  );
}

function valueShort(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "string") return v.length > 40 ? `${v.slice(0, 37)}…` : v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return `[${v.length}]`;
  if (typeof v === "object") return `{${Object.keys(v).length}}`;
  return String(v);
}
