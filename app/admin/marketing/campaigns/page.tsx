"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Send, Plus, Filter as FilterIcon } from "lucide-react";

interface CampaignRow {
  id: string;
  name: string;
  subject: string;
  status: string;
  scheduledAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  stats: Record<string, number> | null;
  createdAt: string;
  segment: { id: string; name: string } | null;
  template: { id: string; name: string } | null;
}

const STATUS_FILTERS = [
  { value: "", label: "Все" },
  { value: "draft", label: "Черновики" },
  { value: "scheduled", label: "Запланированы" },
  { value: "sending", label: "Отправляются" },
  { value: "paused", label: "На паузе" },
  { value: "sent", label: "Отправлены" },
  { value: "failed,cancelled", label: "Архив" },
];

const STATUS_META: Record<string, { label: string; color: string }> = {
  draft: { label: "Черновик", color: "bg-gray-100 text-gray-700" },
  scheduled: { label: "Запланирована", color: "bg-blue-100 text-blue-700" },
  sending: { label: "Отправляется", color: "bg-amber-100 text-amber-700" },
  paused: { label: "На паузе", color: "bg-orange-100 text-orange-700" },
  sent: { label: "Отправлена", color: "bg-emerald-100 text-emerald-700" },
  failed: { label: "Ошибка", color: "bg-red-100 text-red-700" },
  cancelled: { label: "Отменена", color: "bg-gray-200 text-gray-600" },
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "short", year: "numeric" });
}

function calcOR(stats: Record<string, number> | null): string {
  if (!stats || !stats.sent) return "—";
  const opened = stats.opened ?? 0;
  return ((opened / stats.sent) * 100).toFixed(1) + "%";
}

function calcCTR(stats: Record<string, number> | null): string {
  if (!stats || !stats.sent) return "—";
  const clicked = stats.clicked ?? 0;
  return ((clicked / stats.sent) * 100).toFixed(1) + "%";
}

export default function MarketingCampaignsListPage() {
  const [statusFilter, setStatusFilter] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["marketing-campaigns", statusFilter],
    queryFn: async () => {
      const params = statusFilter ? `?status=${statusFilter}` : "";
      const r = await apiClient.get(`/admin/marketing/campaigns${params}`);
      return r.data.data as { items: CampaignRow[]; total: number };
    },
    refetchInterval: 5000, // живой прогресс — пока есть sending кампании
  });

  const items = data?.items ?? [];

  return (
    <div className="container mx-auto max-w-7xl px-4 py-8 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-lg bg-emerald-100 flex items-center justify-center">
            <Send className="h-6 w-6 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">Кампании</h1>
            <p className="text-gray-600">
              Email-рассылки по сегментам через текущий провайдер. Метрики обновляются в реальном времени.
            </p>
          </div>
        </div>
        <Link href="/admin/marketing/campaigns/new">
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            Новая кампания
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FilterIcon className="h-4 w-4" />
            Фильтр по статусу
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-wrap gap-2">
            {STATUS_FILTERS.map((f) => (
              <Button
                key={f.value}
                variant={statusFilter === f.value ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter(f.value)}
              >
                {f.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {data?.total ?? 0} {pluralize(data?.total ?? 0, "кампания", "кампании", "кампаний")}
          </CardTitle>
          <CardDescription>
            OR = открытий / отправлено, CTR = кликов / отправлено. Tracking подтянется в Спринте 5.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-12 text-center text-sm text-gray-500">Загрузка…</div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center">
              <Send className="h-12 w-12 mx-auto text-gray-300 mb-3" />
              <div className="text-sm text-gray-500">Кампаний пока нет</div>
              <Link href="/admin/marketing/campaigns/new">
                <Button variant="outline" className="mt-4 gap-2">
                  <Plus className="h-4 w-4" />
                  Создать первую
                </Button>
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3 text-left">Кампания</th>
                    <th className="px-4 py-3 text-left">Сегмент</th>
                    <th className="px-4 py-3 text-left">Статус</th>
                    <th className="px-4 py-3 text-right">Отправлено</th>
                    <th className="px-4 py-3 text-right">OR</th>
                    <th className="px-4 py-3 text-right">CTR</th>
                    <th className="px-4 py-3 text-left">Дата</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {items.map((c) => {
                    const meta = STATUS_META[c.status] ?? {
                      label: c.status,
                      color: "bg-gray-100 text-gray-700",
                    };
                    const stats = c.stats ?? {};
                    const recipients = stats.recipients ?? 0;
                    const sent = stats.sent ?? 0;
                    const progress = recipients > 0 ? Math.round((sent / recipients) * 100) : 0;

                    return (
                      <tr key={c.id} className="hover:bg-emerald-50/30 transition-colors">
                        <td className="px-4 py-3">
                          <Link
                            href={`/admin/marketing/campaigns/${c.id}`}
                            className="font-medium text-gray-900 hover:text-emerald-600"
                          >
                            {c.name}
                          </Link>
                          <div className="text-xs text-gray-500 truncate max-w-md">
                            {c.subject}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          {c.segment?.name ?? "—"}
                        </td>
                        <td className="px-4 py-3">
                          <Badge className={`${meta.color} hover:${meta.color}`}>
                            {meta.label}
                          </Badge>
                          {c.status === "sending" && recipients > 0 && (
                            <div className="text-xs text-gray-500 mt-1">{progress}%</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          <span className="font-medium">{sent.toLocaleString("ru-RU")}</span>
                          {recipients > 0 && (
                            <span className="text-xs text-gray-500"> / {recipients.toLocaleString("ru-RU")}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                          {calcOR(c.stats)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                          {calcCTR(c.stats)}
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs">
                          {fmtDate(c.finishedAt || c.startedAt || c.scheduledAt || c.createdAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function pluralize(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}
