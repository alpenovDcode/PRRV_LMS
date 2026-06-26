"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Filter, Plus, Copy, Trash2, Send, Pencil } from "lucide-react";

interface SegmentRow {
  id: string;
  name: string;
  description: string | null;
  contactCount: number;
  providerListId: string | null;
  syncedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  _count: { campaigns: number };
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "short", year: "numeric" });
}

export default function MarketingSegmentsListPage() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["marketing-segments"],
    queryFn: async () => {
      const r = await apiClient.get("/admin/marketing/segments");
      return r.data.data as { items: SegmentRow[] };
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiClient.post(`/admin/marketing/segments/${id}/duplicate`);
      return r.data.data as SegmentRow;
    },
    onSuccess: () => {
      toast.success("Копия сегмента создана");
      queryClient.invalidateQueries({ queryKey: ["marketing-segments"] });
    },
    onError: () => toast.error("Не удалось скопировать сегмент"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/admin/marketing/segments/${id}`);
    },
    onSuccess: () => {
      toast.success("Сегмент удалён");
      queryClient.invalidateQueries({ queryKey: ["marketing-segments"] });
    },
    onError: () => toast.error("Не удалось удалить сегмент"),
  });

  const items = data?.items ?? [];

  return (
    <div className="container mx-auto max-w-7xl px-4 py-8 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-lg bg-purple-100 flex items-center justify-center">
            <Filter className="h-6 w-6 text-purple-600" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">Сегменты</h1>
            <p className="text-gray-600">
              Сохранённые наборы фильтров. Используются в кампаниях вместо ручного выбора получателей.
            </p>
          </div>
        </div>
        <Link href="/admin/marketing/segments/new">
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            Новый сегмент
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{items.length} {pluralize(items.length, "сегмент", "сегмента", "сегментов")}</CardTitle>
          <CardDescription>
            Размер контактов считается при создании и редактировании сегмента. Если БД изменилась с
            тех пор, откройте сегмент — он пересчитает превью автоматически.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-12 text-center text-sm text-gray-500">Загрузка…</div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center">
              <Filter className="h-12 w-12 mx-auto text-gray-300 mb-3" />
              <div className="text-sm text-gray-500">Сегментов пока нет</div>
              <Link href="/admin/marketing/segments/new">
                <Button variant="outline" className="mt-4 gap-2">
                  <Plus className="h-4 w-4" />
                  Создать первый сегмент
                </Button>
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3 text-left">Название</th>
                    <th className="px-4 py-3 text-right">Контактов</th>
                    <th className="px-4 py-3 text-right">Кампаний</th>
                    <th className="px-4 py-3 text-left">Обновлён</th>
                    <th className="px-4 py-3 text-right">Действия</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {items.map((segment) => (
                    <tr key={segment.id} className="hover:bg-purple-50/30 transition-colors">
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/marketing/segments/${segment.id}/edit`}
                          className="font-medium text-gray-900 hover:text-purple-600"
                        >
                          {segment.name}
                        </Link>
                        {segment.description && (
                          <div className="text-xs text-gray-500 mt-0.5 truncate max-w-md">
                            {segment.description}
                          </div>
                        )}
                        {segment.providerListId && (
                          <Badge variant="outline" className="text-xs mt-1">
                            Синхронизирован с провайдером
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="font-semibold text-gray-900">
                          {segment.contactCount.toLocaleString("ru-RU")}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700">
                        {segment._count.campaigns}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {fmtDate(segment.updatedAt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <Link href={`/admin/marketing/segments/${segment.id}/edit`}>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Редактировать">
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </Link>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            disabled={duplicateMutation.isPending}
                            onClick={() => duplicateMutation.mutate(segment.id)}
                            title="Дублировать"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Link href={`/admin/marketing/campaigns/new?segmentId=${segment.id}`}>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Создать кампанию">
                              <Send className="h-4 w-4" />
                            </Button>
                          </Link>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                            disabled={deleteMutation.isPending}
                            onClick={() => {
                              if (
                                window.confirm(
                                  segment._count.campaigns > 0
                                    ? `Сегмент привязан к ${segment._count.campaigns} ${pluralize(segment._count.campaigns, "кампании", "кампаниям", "кампаниям")}. Удалить?`
                                    : `Удалить сегмент «${segment.name}»?`
                                )
                              ) {
                                deleteMutation.mutate(segment.id);
                              }
                            }}
                            title="Удалить"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
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
