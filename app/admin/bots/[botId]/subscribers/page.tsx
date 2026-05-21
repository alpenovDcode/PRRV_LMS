"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronLeft,
  ChevronRight,
  Search,
  Upload,
  GitMerge,
  Tags,
  Workflow,
  Ban,
  CheckCircle2,
  CheckSquare,
  Square,
} from "lucide-react";
import { toast } from "sonner";

interface Subscriber {
  id: string;
  chatId: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  tags: string[];
  isBlocked: boolean;
  lastSeenAt: string | null;
  subscribedAt: string;
  firstTouchSlug: string | null;
}

interface FlowOption {
  id: string;
  name: string;
  isActive: boolean;
}

type BulkAction = "add_tag" | "remove_tag" | "start_flow" | "block" | "unblock";

export default function SubscribersPage() {
  const params = useParams<{ botId: string }>();
  const router = useRouter();
  const botId = params.botId;
  const qc = useQueryClient();

  const [q, setQ] = useState("");
  const [tag, setTag] = useState("");
  const [page, setPage] = useState(1);

  // Bulk-выбор. selectedIds — явно тиканные галочки. allMatchedSelected —
  // флаг «применить ко всей выборке по фильтру», не только к видимым.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [allMatchedSelected, setAllMatchedSelected] = useState(false);
  const [bulkAction, setBulkAction] = useState<BulkAction>("add_tag");
  const [bulkTag, setBulkTag] = useState("");
  const [bulkFlowId, setBulkFlowId] = useState<string>("");

  const { data, isLoading } = useQuery({
    queryKey: ["tg-subs", botId, q, tag, page],
    queryFn: async () => {
      const r = await apiClient.get(`/admin/tg/bots/${botId}/subscribers`, {
        params: { q, tag: tag || undefined, page, pageSize: 50 },
      });
      return r.data?.data as {
        items: Subscriber[];
        total: number;
        page: number;
        pageSize: number;
      };
    },
  });

  const flows = useQuery({
    queryKey: ["tg-flows-min", botId],
    queryFn: async () => {
      const r = await apiClient.get(
        `/admin/tg/bots/${botId}/analytics/flows-list`
      );
      return r.data?.data as { flows: FlowOption[] };
    },
  });

  const totalPages = data
    ? Math.max(1, Math.ceil(data.total / data.pageSize))
    : 1;

  const pageIds = useMemo(
    () => (data?.items ?? []).map((s) => s.id),
    [data?.items]
  );
  const allPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));

  const togglePage = () => {
    if (allPageSelected) {
      const next = new Set(selectedIds);
      for (const id of pageIds) next.delete(id);
      setSelectedIds(next);
    } else {
      const next = new Set(selectedIds);
      for (const id of pageIds) next.add(id);
      setSelectedIds(next);
    }
    setAllMatchedSelected(false);
  };
  const toggleOne = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
    setAllMatchedSelected(false);
  };
  const clearSelection = () => {
    setSelectedIds(new Set());
    setAllMatchedSelected(false);
  };

  // Сколько подписчиков пойдёт под bulk-операцию:
  // • allMatchedSelected = берём весь фильтр
  // • иначе — явно выбранные
  const selectionCount = allMatchedSelected
    ? data?.total ?? 0
    : selectedIds.size;

  const bulk = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = { action: bulkAction };
      if (allMatchedSelected) {
        body.filter = { q, tag: tag || undefined };
      } else {
        body.subscriberIds = Array.from(selectedIds);
      }
      if (bulkAction === "add_tag" || bulkAction === "remove_tag") {
        if (!bulkTag.trim()) throw new Error("Укажите тег");
        body.params = { tag: bulkTag.trim() };
      }
      if (bulkAction === "start_flow") {
        if (!bulkFlowId) throw new Error("Выберите сценарий");
        body.params = { flowId: bulkFlowId };
      }
      const r = await apiClient.post(
        `/admin/tg/bots/${botId}/subscribers/bulk`,
        body
      );
      return r.data?.data as { matched: number; affected: number };
    },
    onSuccess: (d) => {
      toast.success(
        `Готово: затронуто ${d.affected} из ${d.matched}. Список обновлён.`
      );
      clearSelection();
      qc.invalidateQueries({ queryKey: ["tg-subs", botId] });
    },
    onError: (
      e: Error & { response?: { data?: { error?: { message?: string } } } }
    ) => {
      toast.error(e?.response?.data?.error?.message ?? e.message);
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push(`/admin/bots/${botId}/subscribers/import`)}
        >
          <Upload className="h-4 w-4 mr-1" /> Импорт CSV
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push(`/admin/bots/${botId}/subscribers/merge`)}
        >
          <GitMerge className="h-4 w-4 mr-1" /> Объединить дубли
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Фильтры</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Поиск по имени или chat_id"
              className="pl-9"
              value={q}
              onChange={(e) => {
                setPage(1);
                setQ(e.target.value);
                clearSelection();
              }}
            />
          </div>
          <Input
            placeholder="Тег"
            className="w-40"
            value={tag}
            onChange={(e) => {
              setPage(1);
              setTag(e.target.value);
              clearSelection();
            }}
          />
        </CardContent>
      </Card>

      {selectionCount > 0 && (
        <Card className="border-purple-300 bg-purple-50/40 sticky top-0 z-20">
          <CardContent className="py-3 space-y-2">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="text-sm">
                Выбрано:{" "}
                <span className="font-mono font-semibold">
                  {selectionCount}
                </span>
                {!allMatchedSelected &&
                  data &&
                  data.total > selectedIds.size && (
                    <Button
                      variant="link"
                      size="sm"
                      className="px-2 h-auto py-0"
                      onClick={() => setAllMatchedSelected(true)}
                    >
                      Выбрать все по фильтру ({data.total.toLocaleString("ru-RU")})
                    </Button>
                  )}
              </div>
              <Button variant="ghost" size="sm" onClick={clearSelection}>
                Сбросить
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={bulkAction}
                onValueChange={(v) => setBulkAction(v as BulkAction)}
              >
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="add_tag">
                    <Tags className="inline h-3 w-3 mr-1" /> Добавить тег
                  </SelectItem>
                  <SelectItem value="remove_tag">
                    <Tags className="inline h-3 w-3 mr-1" /> Снять тег
                  </SelectItem>
                  <SelectItem value="start_flow">
                    <Workflow className="inline h-3 w-3 mr-1" /> Запустить сценарий
                  </SelectItem>
                  <SelectItem value="block">
                    <Ban className="inline h-3 w-3 mr-1" /> Заблокировать
                  </SelectItem>
                  <SelectItem value="unblock">
                    <CheckCircle2 className="inline h-3 w-3 mr-1" /> Разблокировать
                  </SelectItem>
                </SelectContent>
              </Select>
              {(bulkAction === "add_tag" || bulkAction === "remove_tag") && (
                <Input
                  placeholder="имя тега"
                  className="w-44"
                  value={bulkTag}
                  onChange={(e) => setBulkTag(e.target.value)}
                />
              )}
              {bulkAction === "start_flow" && (
                <Select value={bulkFlowId} onValueChange={setBulkFlowId}>
                  <SelectTrigger className="w-56">
                    <SelectValue placeholder="— выберите сценарий —" />
                  </SelectTrigger>
                  <SelectContent>
                    {flows.data?.flows
                      .filter((f) => f.isActive)
                      .map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}
              <Button
                disabled={bulk.isPending}
                onClick={() => {
                  if (
                    confirm(
                      `Применить действие к ${selectionCount} подписчикам? Действие необратимо.`
                    )
                  ) {
                    bulk.mutate();
                  }
                }}
              >
                {bulk.isPending ? "Выполняем…" : "Применить"}
              </Button>
            </div>
            {allMatchedSelected && (
              <div className="text-[11px] text-amber-700">
                ⚠ Действие применится ко ВСЕМ подписчикам под текущим фильтром
                (до 5000). Сузьте фильтр, чтобы уменьшить выборку.
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Загрузка...</div>
          ) : !data?.items.length ? (
            <div className="p-8 text-center text-muted-foreground">пусто</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
                  <th className="p-3 w-8">
                    <button
                      onClick={togglePage}
                      title={
                        allPageSelected
                          ? "Снять выделение на странице"
                          : "Выбрать всех на странице"
                      }
                    >
                      {allPageSelected ? (
                        <CheckSquare className="h-4 w-4 text-purple-600" />
                      ) : (
                        <Square className="h-4 w-4" />
                      )}
                    </button>
                  </th>
                  <th className="text-left p-3">Пользователь</th>
                  <th className="text-left p-3">@username</th>
                  <th className="text-left p-3">Теги</th>
                  <th className="text-left p-3">Источник</th>
                  <th className="text-left p-3">Подписан</th>
                  <th className="text-left p-3">Статус</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((s) => {
                  const isSelected = selectedIds.has(s.id);
                  return (
                    <tr
                      key={s.id}
                      className={`border-b hover:bg-muted/30 ${
                        isSelected ? "bg-purple-50/60" : ""
                      }`}
                    >
                      <td
                        className="p-3 w-8"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleOne(s.id);
                        }}
                      >
                        <button>
                          {isSelected ? (
                            <CheckSquare className="h-4 w-4 text-purple-600" />
                          ) : (
                            <Square className="h-4 w-4" />
                          )}
                        </button>
                      </td>
                      <td
                        className="p-3 cursor-pointer"
                        onClick={() =>
                          router.push(`/admin/bots/${botId}/subscribers/${s.id}`)
                        }
                      >
                        {[s.firstName, s.lastName].filter(Boolean).join(" ") || s.chatId}
                      </td>
                      <td
                        className="p-3 cursor-pointer"
                        onClick={() =>
                          router.push(`/admin/bots/${botId}/subscribers/${s.id}`)
                        }
                      >
                        {s.username ? "@" + s.username : "—"}
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1">
                          {s.tags.slice(0, 4).map((t) => (
                            <Badge key={t} variant="secondary" className="text-xs">
                              {t}
                            </Badge>
                          ))}
                          {s.tags.length > 4 && (
                            <span className="text-xs text-muted-foreground">
                              +{s.tags.length - 4}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">
                        {s.firstTouchSlug ?? "—"}
                      </td>
                      <td className="p-3 text-xs">
                        {new Date(s.subscribedAt).toLocaleDateString("ru-RU")}
                      </td>
                      <td className="p-3">
                        {s.isBlocked ? (
                          <Badge variant="destructive">blocked</Badge>
                        ) : (
                          <Badge>active</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {data && data.total > data.pageSize && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span>
            стр. {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
