"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ShieldOff, UserX, AlertOctagon, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";

interface SuppressionRow {
  id: string;
  email: string;
  fullName: string | null;
  unsubscribedAt: string | null;
  reason: "unsubscribed" | "bounced" | "spam" | "manual";
  lastEventAt: string | null;
}

interface SuppressionData {
  items: SuppressionRow[];
  total: number;
  page: number;
  limit: number;
  aggregates: { unsubscribed: number; bounced: number; spam: number };
}

const REASON_META: Record<
  SuppressionRow["reason"],
  { label: string; color: string }
> = {
  unsubscribed: { label: "Сам отписался", color: "bg-rose-50 text-rose-700" },
  bounced: { label: "Адрес мёртв (hard bounce)", color: "bg-amber-50 text-amber-700" },
  spam: { label: "Жалоба на спам", color: "bg-red-50 text-red-700" },
  manual: { label: "Отписан вручную", color: "bg-gray-100 text-gray-700" },
};

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function SuppressionListPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["marketing-suppression", page],
    queryFn: async () => {
      const r = await apiClient.get(`/admin/marketing/suppression?page=${page}`);
      return r.data.data as SuppressionData;
    },
  });

  const resubMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.post(`/admin/marketing/contacts/${id}/unsubscribe`, { subscribe: true });
    },
    onSuccess: () => {
      toast.success("Подписка восстановлена. Будьте осторожны: если был hard-bounce, адрес снова отвалится.");
      queryClient.invalidateQueries({ queryKey: ["marketing-suppression"] });
    },
    onError: () => toast.error("Не удалось вернуть подписку"),
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / (data?.limit ?? 30)));

  return (
    <div className="container mx-auto max-w-7xl px-4 py-8 space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-lg bg-red-100 flex items-center justify-center">
          <ShieldOff className="h-6 w-6 text-red-600" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Suppression list</h1>
          <p className="text-gray-600">
            Пользователи, которые не получают маркетинговые письма. Hard-bounce и жалобы добавляются
            автоматически — это защищает репутацию домена.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <SummaryCard
          label="Всего в списке"
          value={total}
          icon={ShieldOff}
          color="text-red-600 bg-red-50"
        />
        <SummaryCard
          label="Сами отписались"
          value={data?.aggregates.unsubscribed ?? 0}
          icon={UserX}
          color="text-rose-600 bg-rose-50"
        />
        <SummaryCard
          label="Hard bounce"
          value={data?.aggregates.bounced ?? 0}
          icon={AlertOctagon}
          color="text-amber-600 bg-amber-50"
        />
        <SummaryCard
          label="Жалоб на спам"
          value={data?.aggregates.spam ?? 0}
          icon={AlertOctagon}
          color="text-red-600 bg-red-50"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Список</CardTitle>
          <CardDescription>
            Можно восстановить подписку для отдельных пользователей. Если причина — hard-bounce
            или жалоба на спам, делайте это только если знаете что адрес снова работает: иначе
            следующая отправка снова попадёт в suppression и испортит метрики.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-12 text-center text-sm text-gray-500">Загрузка…</div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-500">Suppression list пуст 🎉</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3 text-left">Email</th>
                    <th className="px-4 py-3 text-left">Причина</th>
                    <th className="px-4 py-3 text-left">Дата</th>
                    <th className="px-4 py-3 text-right">Действие</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {items.map((row) => {
                    const meta = REASON_META[row.reason];
                    return (
                      <tr key={row.id}>
                        <td className="px-4 py-3">
                          <Link
                            href={`/admin/marketing/contacts/${row.id}`}
                            className="text-gray-900 hover:text-red-600"
                          >
                            {row.email}
                          </Link>
                          {row.fullName && (
                            <div className="text-xs text-gray-500">{row.fullName}</div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <Badge className={meta.color}>{meta.label}</Badge>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">
                          {fmt(row.unsubscribedAt || row.lastEventAt)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              const warn = row.reason === "bounced" || row.reason === "spam";
                              if (
                                warn &&
                                !window.confirm(
                                  `Причина: ${meta.label}. Восстановление подписки рискованно — это может снова попасть в bounce/spam. Продолжить?`
                                )
                              ) {
                                return;
                              }
                              resubMutation.mutate(row.id);
                            }}
                            disabled={resubMutation.isPending}
                            className="text-emerald-600 hover:text-emerald-700 gap-2"
                          >
                            <RefreshCw className="h-3 w-3" />
                            Вернуть подписку
                          </Button>
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

      {items.length > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">
            Страница {page} из {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
              Назад
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Вперёд
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number;
  icon: typeof ShieldOff;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-600">{label}</span>
          <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${color}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <div className="text-2xl font-bold text-gray-900 tabular-nums">
          {value.toLocaleString("ru-RU")}
        </div>
      </CardContent>
    </Card>
  );
}
