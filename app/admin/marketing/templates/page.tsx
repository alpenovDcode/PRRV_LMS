"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { FileText, Plus, Copy, Trash2, Archive, ArchiveRestore, Pencil } from "lucide-react";

interface TemplateRow {
  id: string;
  name: string;
  category: string;
  subject: string;
  preheader: string | null;
  thumbnailUrl: string | null;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  _count: { campaigns: number };
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function MarketingTemplatesListPage() {
  const queryClient = useQueryClient();
  const [showArchived, setShowArchived] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["marketing-templates", { archived: showArchived }],
    queryFn: async () => {
      const r = await apiClient.get(
        `/admin/marketing/templates${showArchived ? "?archived=true" : ""}`
      );
      return r.data.data as { items: TemplateRow[] };
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiClient.post(`/admin/marketing/templates/${id}/duplicate`);
      return r.data.data as TemplateRow;
    },
    onSuccess: () => {
      toast.success("Шаблон скопирован");
      queryClient.invalidateQueries({ queryKey: ["marketing-templates"] });
    },
    onError: () => toast.error("Не удалось скопировать"),
  });

  const archiveMutation = useMutation({
    mutationFn: async (vars: { id: string; isArchived: boolean }) => {
      await apiClient.patch(`/admin/marketing/templates/${vars.id}`, {
        isArchived: vars.isArchived,
      });
    },
    onSuccess: (_, vars) => {
      toast.success(vars.isArchived ? "Шаблон архивирован" : "Шаблон восстановлен");
      queryClient.invalidateQueries({ queryKey: ["marketing-templates"] });
    },
    onError: () => toast.error("Не удалось обновить статус"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/admin/marketing/templates/${id}`);
    },
    onSuccess: () => {
      toast.success("Шаблон удалён");
      queryClient.invalidateQueries({ queryKey: ["marketing-templates"] });
    },
    onError: () => toast.error("Не удалось удалить"),
  });

  const items = data?.items ?? [];

  return (
    <div className="container mx-auto max-w-7xl px-4 py-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-lg bg-amber-100 flex items-center justify-center">
            <FileText className="h-6 w-6 text-amber-600" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">Шаблоны писем</h1>
            <p className="text-gray-600">
              Блочные шаблоны для маркетинговых рассылок. Транзакционные письма
              (welcome, ДЗ, оплата) — в отдельном разделе{" "}
              <Link href="/admin/email-templates" className="text-amber-600 hover:underline">
                Email шаблоны
              </Link>
              .
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setShowArchived(!showArchived)}
            className="gap-2"
          >
            <Archive className="h-4 w-4" />
            {showArchived ? "Скрыть архив" : "Показать архив"}
          </Button>
          <Link href="/admin/marketing/templates/new">
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Новый шаблон
            </Button>
          </Link>
        </div>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-sm text-gray-500">Загрузка…</div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 mx-auto text-gray-300 mb-3" />
            <div className="text-sm text-gray-500">
              {showArchived ? "Архивных шаблонов нет" : "Шаблонов пока нет"}
            </div>
            <Link href="/admin/marketing/templates/new">
              <Button variant="outline" className="mt-4 gap-2">
                <Plus className="h-4 w-4" />
                Создать первый шаблон
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((tpl) => (
            <Card key={tpl.id} className={tpl.isArchived ? "opacity-60" : ""}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base truncate">{tpl.name}</CardTitle>
                <CardDescription className="truncate">{tpl.subject}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="aspect-[3/4] bg-gray-50 rounded-md border border-gray-200 flex items-center justify-center text-gray-300 text-xs">
                  {tpl.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={tpl.thumbnailUrl}
                      alt={tpl.name}
                      className="w-full h-full object-cover object-top rounded-md"
                    />
                  ) : (
                    <FileText className="h-12 w-12" />
                  )}
                </div>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>{fmtDate(tpl.updatedAt)}</span>
                  <div className="flex items-center gap-1">
                    <Badge variant="outline" className="text-xs capitalize">
                      {tpl.category === "marketing" ? "маркетинг" : "прогрев"}
                    </Badge>
                    {tpl._count.campaigns > 0 && (
                      <Badge variant="outline" className="text-xs">
                        {tpl._count.campaigns} кампаний
                      </Badge>
                    )}
                    {tpl.isArchived && (
                      <Badge variant="secondary" className="bg-gray-100 text-gray-700 text-xs">
                        Архив
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex gap-1 pt-2">
                  <Link href={`/admin/marketing/templates/${tpl.id}/edit`} className="flex-1">
                    <Button variant="outline" size="sm" className="w-full gap-2">
                      <Pencil className="h-3 w-3" />
                      Открыть
                    </Button>
                  </Link>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 w-9 p-0"
                    title="Дублировать"
                    disabled={duplicateMutation.isPending}
                    onClick={() => duplicateMutation.mutate(tpl.id)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 w-9 p-0"
                    title={tpl.isArchived ? "Восстановить" : "В архив"}
                    disabled={archiveMutation.isPending}
                    onClick={() =>
                      archiveMutation.mutate({ id: tpl.id, isArchived: !tpl.isArchived })
                    }
                  >
                    {tpl.isArchived ? (
                      <ArchiveRestore className="h-4 w-4" />
                    ) : (
                      <Archive className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 w-9 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                    title="Удалить"
                    disabled={deleteMutation.isPending}
                    onClick={() => {
                      if (
                        window.confirm(
                          tpl._count.campaigns > 0
                            ? `Шаблон привязан к ${tpl._count.campaigns} кампаниям. Удалить?`
                            : `Удалить шаблон «${tpl.name}»?`
                        )
                      ) {
                        deleteMutation.mutate(tpl.id);
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
