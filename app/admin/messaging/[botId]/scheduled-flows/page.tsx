"use client";

/**
 * /admin/messaging/[botId]/scheduled-flows — расписание разовых запусков
 * MessagingFlow. Аналог /admin/bots/[id]/scheduled-flows у TG.
 *
 * UX:
 *   • Форма «Создать»: name, flow (select), дата+время (local datetime-input
 *     конвертируется в ISO/UTC при отправке), фильтр аудитории (tagsAny,
 *     excludeTags + чекбокс allActive).
 *   • Список существующих: статус-бейдж, дата, имя, flow, фильтр-summary,
 *     счётчики launched/failed после завершения, lastError. Для status=
 *     scheduled — кнопка «Отменить» (delete).
 *   • Auto-refetch 30с — чтобы увидеть переход scheduled → running →
 *     completed без F5.
 */

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  CalendarClock,
  CheckCircle2,
  Loader2,
  Play,
  Trash2,
  XCircle,
} from "lucide-react";

interface Flow {
  id: string;
  name: string;
  isActive: boolean;
}

interface ScheduledFlow {
  id: string;
  botId: string;
  flowId: string;
  name: string;
  filter: any;
  scheduledAt: string;
  status: "scheduled" | "running" | "completed" | "failed" | "cancelled";
  startedAt: string | null;
  finishedAt: string | null;
  totalLaunched: number;
  totalFailed: number;
  lastError: string | null;
}

const STATUS_COLOR: Record<ScheduledFlow["status"], string> = {
  scheduled: "bg-amber-100 text-amber-700 border-amber-200",
  running: "bg-blue-100 text-blue-700 border-blue-200",
  completed: "bg-emerald-100 text-emerald-700 border-emerald-200",
  failed: "bg-rose-100 text-rose-700 border-rose-200",
  cancelled: "bg-zinc-100 text-zinc-600 border-zinc-200",
};

const STATUS_LABEL: Record<ScheduledFlow["status"], string> = {
  scheduled: "Запланировано",
  running: "Запускается",
  completed: "Готово",
  failed: "Ошибка",
  cancelled: "Отменено",
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Локальное «yyyy-MM-ddTHH:mm» в момент now+1 час для UI-формы. */
function defaultLocalDatetime(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
    d.getDate()
  )}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Подытоженное описание фильтра аудитории для строки списка. */
function summariseFilter(filter: any): string {
  if (!filter || typeof filter !== "object") return "все активные";
  const parts: string[] = [];
  if (filter.allActive) parts.push("все активные");
  if (Array.isArray(filter.tagsAny) && filter.tagsAny.length)
    parts.push(`теги: ${filter.tagsAny.join(", ")}`);
  if (Array.isArray(filter.tagsAll) && filter.tagsAll.length)
    parts.push(`все теги: ${filter.tagsAll.join(", ")}`);
  if (Array.isArray(filter.excludeTags) && filter.excludeTags.length)
    parts.push(`исключить: ${filter.excludeTags.join(", ")}`);
  if (Array.isArray(filter.subscriberIds) && filter.subscriberIds.length)
    parts.push(`id-список: ${filter.subscriberIds.length}`);
  return parts.length ? parts.join(" · ") : "все активные";
}

export default function MessagingBotScheduledFlowsPage() {
  const { botId } = useParams<{ botId: string }>();
  const queryClient = useQueryClient();

  // ── списки ────────────────────────────────────────────────────────────
  const { data: flows = [] } = useQuery({
    queryKey: ["messaging-flows", botId],
    queryFn: async () => {
      const r = await apiClient.get(
        `/admin/messaging/bots/${botId}/flows`
      );
      // API возвращает { flows: Flow[] } либо { data: Flow[] } — обработаем оба
      const data = r.data?.data;
      return (Array.isArray(data) ? data : data?.flows ?? []) as Flow[];
    },
  });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["messaging-scheduled-flows", botId],
    queryFn: async () => {
      const r = await apiClient.get(
        `/admin/messaging/bots/${botId}/scheduled-flows`
      );
      return (r.data?.data ?? []) as ScheduledFlow[];
    },
    refetchInterval: 30_000,
  });

  // ── форма создания ────────────────────────────────────────────────────
  const [name, setName] = useState("");
  const [flowId, setFlowId] = useState<string>("");
  const [whenLocal, setWhenLocal] = useState(defaultLocalDatetime());
  const [allActive, setAllActive] = useState(true);
  const [tagsAny, setTagsAny] = useState("");
  const [excludeTags, setExcludeTags] = useState("");

  // Сбросим выбор flow когда список загрузится впервые
  useEffect(() => {
    if (!flowId && flows.length > 0) {
      const firstActive = flows.find((f) => f.isActive);
      if (firstActive) setFlowId(firstActive.id);
    }
  }, [flows, flowId]);

  const create = useMutation({
    mutationFn: async () => {
      const filter: any = {};
      if (allActive) filter.allActive = true;
      const tagsAnyArr = tagsAny
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const excludeTagsArr = excludeTags
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (tagsAnyArr.length) filter.tagsAny = tagsAnyArr;
      if (excludeTagsArr.length) filter.excludeTags = excludeTagsArr;
      // datetime-local — в текущей TZ браузера; конвертим в ISO/UTC
      const scheduledAt = new Date(whenLocal).toISOString();

      const r = await apiClient.post(
        `/admin/messaging/bots/${botId}/scheduled-flows`,
        { flowId, name: name.trim(), scheduledAt, filter }
      );
      return r.data?.data;
    },
    onSuccess: () => {
      toast.success("Расписание создано");
      setName("");
      setTagsAny("");
      setExcludeTags("");
      setWhenLocal(defaultLocalDatetime());
      queryClient.invalidateQueries({
        queryKey: ["messaging-scheduled-flows", botId],
      });
    },
    onError: (e: any) => {
      toast.error(
        e?.response?.data?.error ??
          e?.message ??
          "Не удалось создать расписание"
      );
    },
  });

  const cancelSched = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiClient.delete(
        `/admin/messaging/bots/${botId}/scheduled-flows/${id}`
      );
      return r.data;
    },
    onSuccess: () => {
      toast.success("Отменено");
      queryClient.invalidateQueries({
        queryKey: ["messaging-scheduled-flows", botId],
      });
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.error ?? "Не удалось отменить");
    },
  });

  const sorted = useMemo(() => {
    // scheduled и running — наверх; завершённые — ниже, по дате.
    const rank = (s: ScheduledFlow["status"]) =>
      s === "scheduled" ? 0 : s === "running" ? 1 : 2;
    return [...items].sort(
      (a, b) =>
        rank(a.status) - rank(b.status) ||
        new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime()
    );
  }, [items]);

  const canSubmit =
    !!flowId && name.trim().length > 0 && whenLocal && !create.isPending;

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {/* Форма создания */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-violet-500" />
            Новое расписание
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div>
            <Label className="text-xs">Название</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Напр.: «Утренняя реактивация»"
            />
          </div>
          <div>
            <Label className="text-xs">Воронка</Label>
            <Select value={flowId} onValueChange={setFlowId}>
              <SelectTrigger>
                <SelectValue placeholder="Выбери воронку" />
              </SelectTrigger>
              <SelectContent>
                {flows.length === 0 ? (
                  <SelectItem value="_none" disabled>
                    Нет доступных воронок
                  </SelectItem>
                ) : (
                  flows.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name} {!f.isActive && "(неактивна)"}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Когда запустить (ваш часовой пояс)</Label>
            <Input
              type="datetime-local"
              value={whenLocal}
              onChange={(e) => setWhenLocal(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs">Аудитория</Label>
            <div className="flex items-center gap-2 mt-1">
              <label className="flex items-center gap-1 text-sm">
                <input
                  type="checkbox"
                  checked={allActive}
                  onChange={(e) => setAllActive(e.target.checked)}
                />
                Все активные
              </label>
            </div>
          </div>
          <div>
            <Label className="text-xs">
              Теги (любой из) — через запятую
            </Label>
            <Input
              value={tagsAny}
              onChange={(e) => setTagsAny(e.target.value)}
              placeholder="vip, promo2025"
            />
          </div>
          <div>
            <Label className="text-xs">
              Исключить теги — через запятую
            </Label>
            <Input
              value={excludeTags}
              onChange={(e) => setExcludeTags(e.target.value)}
              placeholder="unsubscribed"
            />
          </div>
          <div className="md:col-span-2 flex justify-end">
            <Button
              onClick={() => create.mutate()}
              disabled={!canSubmit}
              className="gap-1"
            >
              {create.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              {create.isPending ? "Создаю…" : "Запланировать"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Список */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Запланированные запуски</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Загрузка…</div>
          ) : sorted.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground text-center">
              Нет запланированных запусков
            </div>
          ) : (
            <div className="divide-y divide-zinc-100">
              {sorted.map((s) => {
                const isFinal =
                  s.status === "completed" ||
                  s.status === "failed" ||
                  s.status === "cancelled";
                const flow = flows.find((f) => f.id === s.flowId);
                return (
                  <div
                    key={s.id}
                    className="p-3 flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center flex-wrap gap-2">
                        <span className="font-medium">{s.name}</span>
                        <Badge
                          variant="outline"
                          className={`text-[10px] uppercase border ${
                            STATUS_COLOR[s.status]
                          }`}
                        >
                          {STATUS_LABEL[s.status]}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {fmtDate(s.scheduledAt)} · воронка{" "}
                        <span className="font-mono">
                          {flow?.name ?? s.flowId.slice(0, 8)}
                        </span>{" "}
                        · {summariseFilter(s.filter)}
                      </div>
                      {isFinal && (
                        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3">
                          {s.status === "completed" && (
                            <>
                              <span className="flex items-center gap-1 text-emerald-700">
                                <CheckCircle2 className="h-3 w-3" />
                                запущено {s.totalLaunched}
                              </span>
                              {s.totalFailed > 0 && (
                                <span className="flex items-center gap-1 text-rose-700">
                                  <XCircle className="h-3 w-3" />
                                  не дошло {s.totalFailed}
                                </span>
                              )}
                            </>
                          )}
                          {s.status === "failed" && (
                            <span className="text-rose-700 truncate">
                              {s.lastError ?? "Без подробностей"}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    {s.status === "scheduled" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => cancelSched.mutate(s.id)}
                        disabled={cancelSched.isPending}
                        className="text-rose-600 hover:bg-rose-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
