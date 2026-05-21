"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, GitMerge, Search, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface Subscriber {
  id: string;
  chatId: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  tags: string[];
  isBlocked: boolean;
  subscribedAt: string;
  lastSeenAt: string | null;
}

interface DuplicateGroup {
  key: string;
  members: Subscriber[];
}

export default function MergeSubscribersPage() {
  const params = useParams<{ botId: string }>();
  const router = useRouter();
  const botId = params.botId;
  const qc = useQueryClient();

  const [q, setQ] = useState("");
  const [primaryId, setPrimaryId] = useState<string | null>(null);
  const [secondaryIds, setSecondaryIds] = useState<Set<string>>(new Set());

  const duplicates = useQuery({
    queryKey: ["tg-merge-duplicates", botId],
    queryFn: async () => {
      const r = await apiClient.get(`/admin/tg/bots/${botId}/subscribers/merge`);
      return r.data?.data as { groups: DuplicateGroup[] };
    },
  });

  const search = useQuery({
    queryKey: ["tg-merge-search", botId, q],
    queryFn: async () => {
      const r = await apiClient.get(
        `/admin/tg/bots/${botId}/subscribers/merge`,
        { params: { q } }
      );
      return r.data?.data as { items: Subscriber[] };
    },
    enabled: q.length >= 2,
  });

  const merge = useMutation({
    mutationFn: async () => {
      if (!primaryId) throw new Error("Выберите основного");
      if (secondaryIds.size === 0)
        throw new Error("Выберите хотя бы одного для слияния");
      const r = await apiClient.post(
        `/admin/tg/bots/${botId}/subscribers/merge`,
        {
          primaryId,
          secondaryIds: Array.from(secondaryIds),
        }
      );
      return r.data?.data;
    },
    onSuccess: (d) => {
      toast.success(
        `Слиты ${secondaryIds.size} записей. Перенесено: ${d?.reassigned?.messages ?? 0} сообщений, ${d?.reassigned?.flowRuns ?? 0} рунов.`
      );
      setPrimaryId(null);
      setSecondaryIds(new Set());
      qc.invalidateQueries({ queryKey: ["tg-merge-duplicates", botId] });
      qc.invalidateQueries({ queryKey: ["tg-merge-search", botId] });
      qc.invalidateQueries({ queryKey: ["tg-subs", botId] });
    },
    onError: (e: Error & { response?: { data?: { error?: { message?: string } } } }) => {
      toast.error(e?.response?.data?.error?.message ?? e.message);
    },
  });

  const candidates = useMemo<Subscriber[]>(() => {
    return q.length >= 2 ? search.data?.items ?? [] : [];
  }, [q, search.data]);

  const toggleSecondary = (id: string) => {
    if (id === primaryId) return;
    setSecondaryIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/admin/bots/${botId}/subscribers`)}
        >
          <ArrowLeft className="h-4 w-4" /> к подписчикам
        </Button>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <GitMerge className="h-5 w-5 text-purple-600" /> Объединить дубликаты
        </h1>
      </div>

      <Card>
        <CardContent className="py-4 text-sm text-muted-foreground space-y-1">
          <div>
            Объединение переносит <span className="font-medium">все сообщения, runs, events,
            рассылки, списки</span> с дополнительных записей на основную. Теги
            объединяются, customFields/variables — мержатся с приоритетом
            новых ключей. Дубликаты удаляются.
          </div>
          <div className="text-amber-700">
            ⚠ Действие необратимо. Сначала запустите поиск, проверьте состав, потом
            нажмите «Объединить».
          </div>
        </CardContent>
      </Card>

      {duplicates.data && duplicates.data.groups.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Автодетект (по username, найдено групп: {duplicates.data.groups.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {duplicates.data.groups.slice(0, 20).map((g) => (
              <div key={g.key} className="border rounded p-3 space-y-2">
                <div className="text-xs font-mono text-muted-foreground">
                  {g.key} ({g.members.length} записей)
                </div>
                {g.members.map((s) => (
                  <SubscriberRow
                    key={s.id}
                    sub={s}
                    isPrimary={primaryId === s.id}
                    isSecondary={secondaryIds.has(s.id)}
                    onPickPrimary={() => {
                      setPrimaryId(s.id);
                      setSecondaryIds((prev) => {
                        const next = new Set(prev);
                        next.delete(s.id);
                        // Auto-add остальных членов группы как secondary.
                        for (const m of g.members) {
                          if (m.id !== s.id) next.add(m.id);
                        }
                        return next;
                      });
                    }}
                    onToggleSecondary={() => toggleSecondary(s.id)}
                  />
                ))}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Поиск</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Имя, фамилия, @username или chat_id"
              className="pl-9"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          {q.length >= 2 && (
            <div className="space-y-2">
              {search.isLoading ? (
                <div className="text-sm text-muted-foreground">Поиск…</div>
              ) : candidates.length === 0 ? (
                <div className="text-sm text-muted-foreground">Никого не нашли</div>
              ) : (
                candidates.map((s) => (
                  <SubscriberRow
                    key={s.id}
                    sub={s}
                    isPrimary={primaryId === s.id}
                    isSecondary={secondaryIds.has(s.id)}
                    onPickPrimary={() => {
                      setPrimaryId(s.id);
                      setSecondaryIds((prev) => {
                        const next = new Set(prev);
                        next.delete(s.id);
                        return next;
                      });
                    }}
                    onToggleSecondary={() => toggleSecondary(s.id)}
                  />
                ))
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {(primaryId || secondaryIds.size > 0) && (
        <Card className="border-purple-300 bg-purple-50/40 sticky bottom-3">
          <CardContent className="py-3 space-y-2">
            <div className="text-sm">
              <span className="font-medium">Основной (primary):</span>{" "}
              {primaryId ? (
                <span className="font-mono">{primaryId}</span>
              ) : (
                <span className="text-muted-foreground">не выбран</span>
              )}
              <span className="ml-3 font-medium">Будут объединены:</span>{" "}
              <span className="font-mono">{secondaryIds.size}</span>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setPrimaryId(null);
                  setSecondaryIds(new Set());
                }}
              >
                Сбросить
              </Button>
              <Button
                disabled={!primaryId || secondaryIds.size === 0 || merge.isPending}
                onClick={() => {
                  if (
                    confirm(
                      `Объединить ${secondaryIds.size} запись(ей) в основную? Это действие необратимо.`
                    )
                  ) {
                    merge.mutate();
                  }
                }}
              >
                {merge.isPending ? "Объединение…" : "Объединить"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SubscriberRow({
  sub,
  isPrimary,
  isSecondary,
  onPickPrimary,
  onToggleSecondary,
}: {
  sub: Subscriber;
  isPrimary: boolean;
  isSecondary: boolean;
  onPickPrimary: () => void;
  onToggleSecondary: () => void;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded border p-2 text-sm ${
        isPrimary
          ? "border-emerald-400 bg-emerald-50/60"
          : isSecondary
            ? "border-purple-400 bg-purple-50/40"
            : "border-zinc-200"
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">
          {[sub.firstName, sub.lastName].filter(Boolean).join(" ") || sub.chatId}
          {sub.username && (
            <span className="ml-2 text-muted-foreground">@{sub.username}</span>
          )}
        </div>
        <div className="text-xs text-muted-foreground flex gap-3">
          <span>chat: {sub.chatId}</span>
          <span>с {new Date(sub.subscribedAt).toLocaleDateString("ru-RU")}</span>
          {sub.tags.length > 0 && (
            <span>теги: {sub.tags.slice(0, 3).join(", ")}{sub.tags.length > 3 ? "…" : ""}</span>
          )}
          {sub.isBlocked && (
            <Badge variant="destructive" className="text-[10px]">blocked</Badge>
          )}
        </div>
      </div>
      <div className="flex gap-1">
        <Button
          variant={isPrimary ? "default" : "outline"}
          size="sm"
          onClick={onPickPrimary}
        >
          {isPrimary && <CheckCircle2 className="h-3 w-3 mr-1" />}
          {isPrimary ? "Основной" : "Сделать основным"}
        </Button>
        <Button
          variant={isSecondary ? "default" : "outline"}
          size="sm"
          disabled={isPrimary}
          onClick={onToggleSecondary}
        >
          {isSecondary ? "Снять" : "К слиянию"}
        </Button>
      </div>
    </div>
  );
}
