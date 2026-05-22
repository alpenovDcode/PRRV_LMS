"use client";

// Вкладка «Маркетинг» карточки лида: конверсия, A/B-эксперименты,
// клики по ссылкам, история тегов/списков, UTM-атрибуция, рассылки.
// Источник — тот же /dossier (queryKey общий с вкладкой «История»).

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  formatDate,
  formatTime,
  statusBadgeVariant,
  type DossierData,
  type TouchInfo,
} from "./lead-helpers";

interface Props {
  botId: string;
  subscriberId: string;
}

export function LeadMarketing({ botId, subscriberId }: Props) {
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

  // A/B-эксперименты — события flow.ab_split.
  const abExperiments = useMemo(() => {
    return (data?.events ?? [])
      .filter((e) => e.type === "flow.ab_split")
      .map((e) => ({
        id: e.id,
        at: e.occurredAt,
        variant: String(e.properties?.variant ?? "—"),
        flowId: String(e.properties?.flowId ?? ""),
        nodeId: String(e.properties?.nodeId ?? ""),
      }));
  }, [data?.events]);

  // Клики по ссылкам — redirect.clicked / link.clicked, сгруппированы
  // по slug с подсчётом количества кликов.
  const linkClicks = useMemo(() => {
    const map = new Map<
      string,
      { slug: string; target: string; count: number; lastAt: string }
    >();
    for (const e of data?.events ?? []) {
      if (e.type !== "redirect.clicked" && e.type !== "link.clicked") continue;
      const slug = String(e.properties?.slug ?? "—");
      const target = String(e.properties?.target ?? "");
      const ex = map.get(slug);
      if (ex) {
        ex.count++;
        if (e.occurredAt > ex.lastAt) ex.lastAt = e.occurredAt;
      } else {
        map.set(slug, { slug, target, count: 1, lastAt: e.occurredAt });
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      a.lastAt < b.lastAt ? 1 : -1
    );
  }, [data?.events]);

  // История тегов и списков — события навешивания/снятия.
  const tagHistory = useMemo(() => {
    return (data?.events ?? [])
      .filter(
        (e) =>
          e.type === "subscriber.tag_added" ||
          e.type === "subscriber.tag_removed" ||
          e.type === "subscriber.list_joined" ||
          e.type === "subscriber.list_left"
      )
      .map((e) => {
        const isAdd =
          e.type === "subscriber.tag_added" ||
          e.type === "subscriber.list_joined";
        const isList = e.type.includes("list");
        const label = isList
          ? String(e.properties?.listName ?? e.properties?.listId ?? "—")
          : String(e.properties?.tag ?? "—");
        return { id: e.id, at: e.occurredAt, isAdd, isList, label };
      });
  }, [data?.events]);

  if (isLoading) {
    return <div className="p-4 text-sm text-zinc-400">Загрузка…</div>;
  }
  if (!data) {
    return <div className="p-4 text-sm text-zinc-400">Нет данных</div>;
  }

  const conv = data.conversion;

  return (
    <div className="space-y-5 text-sm">
      {/* Конверсия лида */}
      <section className="space-y-1.5">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          Конверсия по воронкам
        </Label>
        <div className="grid grid-cols-2 gap-1.5 text-xs">
          <StatTile label="запущено" value={conv.started} />
          <StatTile label="завершено" value={conv.completed} />
          <StatTile label="отменено" value={conv.cancelled} />
          <StatTile label="ошибок" value={conv.failed} />
        </div>
        <div className="rounded border bg-background/50 px-2 py-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              completion rate
            </span>
            <span className="text-sm font-semibold">
              {conv.conversionRate}%
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-emerald-500"
              style={{ width: `${Math.min(100, conv.conversionRate)}%` }}
            />
          </div>
        </div>
      </section>

      {/* Статистика взаимодействия */}
      <section className="space-y-1.5">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          Взаимодействие
        </Label>
        <div className="grid grid-cols-3 gap-1.5 text-xs">
          <StatTile label="входящие" value={data.stats.messagesIn} />
          <StatTile label="исходящие" value={data.stats.messagesOut} />
          <StatTile label="клики кнопок" value={data.stats.buttonClicks} />
        </div>
      </section>

      {/* A/B-эксперименты */}
      <section className="space-y-1.5">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          A/B-эксперименты ({abExperiments.length})
        </Label>
        {abExperiments.length === 0 ? (
          <div className="text-xs text-muted-foreground">
            Лид не проходил через split-ноды.
          </div>
        ) : (
          <div className="space-y-1">
            {abExperiments.map((ab) => (
              <div
                key={ab.id}
                className="flex items-center justify-between gap-2 rounded border border-pink-200 bg-pink-50/50 px-2 py-1"
              >
                <span className="flex items-center gap-1.5">
                  <span>🎲</span>
                  <Badge className="border-pink-300 bg-pink-100 font-mono text-[10px] text-pink-800">
                    {ab.variant}
                  </Badge>
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {formatDate(ab.at)} {formatTime(ab.at)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Клики по ссылкам */}
      <section className="space-y-1.5">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          Клики по ссылкам ({linkClicks.length})
        </Label>
        {linkClicks.length === 0 ? (
          <div className="text-xs text-muted-foreground">
            Лид не кликал по трекинг-ссылкам.
          </div>
        ) : (
          <div className="space-y-1">
            {linkClicks.map((lc) => (
              <div
                key={lc.slug}
                className="rounded border border-zinc-200 px-2 py-1"
                title={lc.target}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-[11px]">
                    🔗 {lc.slug}
                  </span>
                  <Badge variant="secondary" className="shrink-0 text-[10px]">
                    {lc.count}{" "}
                    {lc.count === 1 ? "клик" : lc.count < 5 ? "клика" : "кликов"}
                  </Badge>
                </div>
                {lc.target && (
                  <div className="truncate text-[10px] text-muted-foreground">
                    → {lc.target}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* История тегов и списков */}
      <section className="space-y-1.5">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          История тегов и списков ({tagHistory.length})
        </Label>
        {tagHistory.length === 0 ? (
          <div className="text-xs text-muted-foreground">Изменений не было</div>
        ) : (
          <div className="space-y-0.5">
            {tagHistory.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between gap-2 border-b py-1 text-xs last:border-0"
              >
                <span className="flex items-center gap-1.5">
                  <span
                    className={
                      t.isAdd
                        ? "font-semibold text-emerald-600"
                        : "font-semibold text-red-500"
                    }
                  >
                    {t.isAdd ? "+" : "−"}
                  </span>
                  <span className="text-[10px] uppercase text-muted-foreground">
                    {t.isList ? "список" : "тег"}
                  </span>
                  <span className="truncate font-medium">{t.label}</span>
                </span>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {formatDate(t.at)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* UTM-атрибуция */}
      <section className="space-y-1.5">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          Атрибуция (UTM)
        </Label>
        {!data.touches.first && !data.touches.last ? (
          <div className="text-xs text-muted-foreground">
            Органика — пришёл без трекинг-ссылки.
          </div>
        ) : (
          <div className="space-y-1.5">
            {data.touches.first && (
              <TouchBlock label="Первое касание" touch={data.touches.first} />
            )}
            {data.touches.last &&
              data.touches.last.slug !== data.touches.first?.slug && (
                <TouchBlock label="Последнее касание" touch={data.touches.last} />
              )}
          </div>
        )}
      </section>

      {/* Полученные рассылки */}
      <section className="space-y-1.5">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          Рассылки ({data.broadcasts.length})
        </Label>
        {data.broadcasts.length === 0 ? (
          <div className="text-xs text-muted-foreground">
            Лид не получал рассылок.
          </div>
        ) : (
          <div className="space-y-1">
            {data.broadcasts.map((b) => (
              <div
                key={b.id}
                className="flex items-center justify-between gap-2 border-b py-1 text-xs last:border-0"
                title={b.errorMessage ?? undefined}
              >
                <span className="truncate">{b.broadcastName}</span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <Badge
                    variant={statusBadgeVariant(b.status)}
                    className="text-[10px]"
                  >
                    {b.status}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">
                    {b.sentAt ? formatDate(b.sentAt) : "—"}
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded border bg-background/50 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}

function TouchBlock({ label, touch }: { label: string; touch: TouchInfo }) {
  const utm = touch.link?.utm ?? {};
  const utmEntries = Object.entries(utm).filter(
    ([, v]) => v != null && v !== ""
  );
  return (
    <div className="rounded border bg-background/50 px-2 py-1.5 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-medium">{label}</span>
        <span className="text-[10px] text-muted-foreground">
          {formatDate(touch.at)}
        </span>
      </div>
      <div className="mt-0.5">
        <span className="font-mono text-[11px]">{touch.slug}</span>
        {touch.link?.name && (
          <span className="ml-2 text-[10px] text-muted-foreground">
            «{touch.link.name}»
          </span>
        )}
      </div>
      {utmEntries.length > 0 && (
        <dl className="mt-1 space-y-0.5">
          {utmEntries.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-2 text-[10px]">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="truncate" style={{ maxWidth: 150 }}>
                {String(v)}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
