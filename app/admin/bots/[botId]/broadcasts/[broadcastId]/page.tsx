"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Download, ExternalLink } from "lucide-react";

interface ReportResp {
  broadcast: {
    id: string;
    name: string;
    status: string;
    filter: Record<string, unknown>;
    totalRecipients: number;
    sentCount: number;
    failedCount: number;
    blockedCount: number;
    scheduledAt: string | null;
    startedAt: string | null;
    finishedAt: string | null;
    createdAt: string;
  };
  counts: {
    total: number;
    pending: number;
    sent: number;
    failed: number;
    blocked: number;
    skipped: number;
  };
  clicks: { uniqueClickers: number; totalClicks: number; ctr: number };
  targets: Array<{ target: string; clicks: number; uniqueClickers: number }>;
  attributionWindowDays: number;
}

export default function BroadcastReportPage() {
  const params = useParams<{ botId: string; broadcastId: string }>();
  const { botId, broadcastId } = params;

  const { data, isLoading } = useQuery({
    queryKey: ["tg-broadcast-report", botId, broadcastId],
    queryFn: async () => {
      const r = await apiClient.get(
        `/admin/tg/bots/${botId}/broadcasts/${broadcastId}/report`
      );
      return r.data?.data as ReportResp;
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 text-sm text-muted-foreground">Загрузка отчёта…</div>
    );
  }
  if (!data) {
    return <div className="p-6 text-sm text-rose-600">Рассылка не найдена</div>;
  }

  const ctrPct = (data.clicks.ctr * 100).toFixed(1);

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-center gap-2">
        <Link href={`/admin/bots/${botId}/broadcasts`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-1 h-4 w-4" /> К списку
          </Button>
        </Link>
        <h1 className="text-xl font-semibold flex-1">
          {data.broadcast.name}
          <Badge variant="secondary" className="ml-2 text-[10px]">
            {data.broadcast.status}
          </Badge>
        </h1>
        <a
          href={`/api/admin/tg/bots/${botId}/broadcasts/${broadcastId}/report/clickers`}
          target="_blank"
          rel="noreferrer"
        >
          <Button variant="outline" size="sm">
            <Download className="mr-1 h-4 w-4" /> CSV кликнувших
          </Button>
        </a>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Stat label="Всего получателей" value={data.counts.total} />
        <Stat
          label="Доставлено"
          value={data.counts.sent}
          hint={
            data.counts.total > 0
              ? `${((data.counts.sent / data.counts.total) * 100).toFixed(1)}%`
              : ""
          }
        />
        <Stat
          label="Заблокировали бота"
          value={data.counts.blocked}
          tone="warning"
        />
        <Stat label="Ошибки" value={data.counts.failed} tone="danger" />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            Клики по ссылкам
            <span className="ml-2 text-xs text-muted-foreground font-normal">
              окно атрибуции: {data.attributionWindowDays} дн.
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Stat label="Уникально кликнули" value={data.clicks.uniqueClickers} />
            <Stat label="Всего кликов" value={data.clicks.totalClicks} />
            <Stat label="CTR (clickers ÷ sent)" value={`${ctrPct}%`} />
          </div>
          {data.targets.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              Пока никто не кликнул. Если рассылка только что отправлена —
              подождите 5–10 минут.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-2 py-2 font-medium">Целевой URL</th>
                  <th className="px-2 py-2 font-medium text-right">Кликов</th>
                  <th className="px-2 py-2 font-medium text-right">
                    Уникальных
                  </th>
                  <th className="px-2 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {data.targets.map((t) => (
                  <tr key={t.target} className="border-b last:border-0">
                    <td className="px-2 py-2 truncate max-w-md">
                      <span className="font-mono text-xs">{t.target}</span>
                    </td>
                    <td className="px-2 py-2 text-right">{t.clicks}</td>
                    <td className="px-2 py-2 text-right">{t.uniqueClickers}</td>
                    <td className="px-2 py-2 text-right">
                      {t.target.startsWith("http") && (
                        <a href={t.target} target="_blank" rel="noreferrer">
                          <ExternalLink className="h-3 w-3 text-muted-foreground" />
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Параметры сегмента</CardTitle>
        </CardHeader>
        <CardContent>
          <FilterSummary filter={data.broadcast.filter} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Тайминги</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm md:grid-cols-2">
          <Row label="Создана" value={fmt(data.broadcast.createdAt)} />
          <Row
            label="Запланирована на"
            value={fmt(data.broadcast.scheduledAt)}
          />
          <Row label="Старт отправки" value={fmt(data.broadcast.startedAt)} />
          <Row label="Завершена" value={fmt(data.broadcast.finishedAt)} />
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number | string;
  hint?: string;
  tone?: "danger" | "warning";
}) {
  const color =
    tone === "danger"
      ? "text-rose-600"
      : tone === "warning"
      ? "text-amber-600"
      : "";
  return (
    <Card>
      <CardContent className="py-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className={`mt-1 text-2xl font-semibold ${color}`}>{value}</div>
        {hint && (
          <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
        )}
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="text-muted-foreground w-44">{label}:</span>
      <span>{value || "—"}</span>
    </div>
  );
}

function fmt(s: string | null | undefined): string {
  if (!s) return "";
  return new Date(s).toLocaleString("ru-RU");
}

function FilterSummary({ filter }: { filter: Record<string, unknown> }) {
  const items: Array<{ label: string; value: string }> = [];
  const list = (k: string, label: string) => {
    const v = filter[k];
    if (Array.isArray(v) && v.length > 0) {
      items.push({ label, value: v.join(", ") });
    }
  };
  const range = (kFrom: string, kTo: string, label: string) => {
    const f = filter[kFrom];
    const t = filter[kTo];
    if (!f && !t) return;
    items.push({
      label,
      value: `${f ? new Date(String(f)).toLocaleDateString("ru-RU") : "…"} — ${
        t ? new Date(String(t)).toLocaleDateString("ru-RU") : "…"
      }`,
    });
  };
  list("tagsAny", "Включены теги (любой)");
  list("tagsAll", "Включены теги (все)");
  list("excludeTags", "Исключены теги");
  list("slugsAny", "Включены UTM-slug");
  list("excludeSlugs", "Исключены UTM-slug");
  range("subscribedFrom", "subscribedTo", "Подписался");
  range("lastSeenFrom", "lastSeenTo", "Последняя активность");
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Без сегментации — рассылка отправлена всем активным подписчикам.
      </p>
    );
  }
  return (
    <ul className="text-sm space-y-1">
      {items.map((i, idx) => (
        <li key={idx} className="flex gap-2">
          <span className="text-muted-foreground w-56">{i.label}:</span>
          <span className="font-mono text-xs">{i.value}</span>
        </li>
      ))}
    </ul>
  );
}
