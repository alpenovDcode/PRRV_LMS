"use client";

import { useState } from "react";
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
import { CalendarClock, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface ScheduledFlow {
  id: string;
  flowId: string;
  flowName: string;
  name: string;
  filter: {
    allActive?: boolean;
    tagsAny?: string[];
    excludeTags?: string[];
  };
  scheduledAt: string;
  status: string;
  startedAt: string | null;
  finishedAt: string | null;
  totalLaunched: number;
  totalFailed: number;
  lastError: string | null;
  createdAt: string;
}

interface FlowsResp {
  flows: Array<{ id: string; name: string; isActive: boolean }>;
}

const STATUS_BADGE: Record<string, string> = {
  scheduled: "bg-amber-100 text-amber-800",
  running: "bg-blue-100 text-blue-800",
  completed: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-zinc-200 text-zinc-600",
  failed: "bg-red-100 text-red-800",
};
const STATUS_LABEL: Record<string, string> = {
  scheduled: "Запланирован",
  running: "Запускается",
  completed: "Завершён",
  cancelled: "Отменён",
  failed: "Ошибка",
};

export default function ScheduledFlowsPage() {
  const params = useParams<{ botId: string }>();
  const botId = params.botId;
  const qc = useQueryClient();

  const [name, setName] = useState("");
  const [flowId, setFlowId] = useState<string>("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [tagsAny, setTagsAny] = useState("");
  const [excludeTags, setExcludeTags] = useState("");
  const [allActive, setAllActive] = useState(true);

  const flows = useQuery({
    queryKey: ["tg-flows-min", botId],
    queryFn: async () => {
      const r = await apiClient.get(
        `/admin/tg/bots/${botId}/analytics/flows-list`
      );
      return r.data?.data as FlowsResp;
    },
  });

  const list = useQuery({
    queryKey: ["tg-scheduled-flows", botId],
    queryFn: async () => {
      const r = await apiClient.get(
        `/admin/tg/bots/${botId}/scheduled-flows`
      );
      return r.data?.data as { items: ScheduledFlow[] };
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!flowId) throw new Error("Выберите флоу");
      if (!name) throw new Error("Назовите запуск");
      if (!date || !time) throw new Error("Укажите дату и время");
      const local = new Date(`${date}T${time}`);
      if (isNaN(local.getTime())) throw new Error("Некорректная дата/время");
      const filter = {
        allActive,
        tagsAny: tagsAny
          ? tagsAny.split(",").map((s) => s.trim()).filter(Boolean)
          : undefined,
        excludeTags: excludeTags
          ? excludeTags.split(",").map((s) => s.trim()).filter(Boolean)
          : undefined,
      };
      const r = await apiClient.post(
        `/admin/tg/bots/${botId}/scheduled-flows`,
        {
          name,
          flowId,
          scheduledAt: local.toISOString(),
          filter,
        }
      );
      return r.data?.data;
    },
    onSuccess: () => {
      toast.success("Запуск запланирован");
      qc.invalidateQueries({ queryKey: ["tg-scheduled-flows", botId] });
      setName("");
    },
    onError: (e: Error & { response?: { data?: { error?: { message?: string } } } }) => {
      toast.error(e?.response?.data?.error?.message ?? e.message);
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(
        `/admin/tg/bots/${botId}/scheduled-flows/${id}`
      );
    },
    onSuccess: () => {
      toast.success("Запись удалена");
      qc.invalidateQueries({ queryKey: ["tg-scheduled-flows", botId] });
    },
    onError: () => toast.error("Не удалось удалить"),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-purple-600" />
            Запланировать запуск флоу
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Название запуска</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Дожим VIP 1 июня"
              />
            </div>
            <div>
              <Label>Сценарий</Label>
              <Select value={flowId} onValueChange={setFlowId}>
                <SelectTrigger>
                  <SelectValue placeholder="— выберите —" />
                </SelectTrigger>
                <SelectContent>
                  {flows.data?.flows.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                      {!f.isActive && " (off)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Дата</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div>
              <Label>Время</Label>
              <Input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                placeholder="10:00"
              />
            </div>
            <div className="md:col-span-2">
              <Label>Кому запускать (фильтр)</Label>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={allActive}
                    onChange={(e) => setAllActive(e.target.checked)}
                  />
                  Всем активным подписчикам
                </label>
                <Input
                  value={tagsAny}
                  onChange={(e) => setTagsAny(e.target.value)}
                  placeholder="Включить с тегами (через запятую): vip, paid"
                />
                <Input
                  value={excludeTags}
                  onChange={(e) => setExcludeTags(e.target.value)}
                  placeholder="Исключить с тегами: lead, cold"
                />
              </div>
            </div>
          </div>
          <div className="text-[11px] text-muted-foreground">
            Время вводится в локальном часовом поясе вашего браузера и
            конвертируется в UTC при сохранении. Минимальная задержка от
            «сейчас» — 10 секунд.
          </div>
          <Button onClick={() => create.mutate()} disabled={create.isPending}>
            {create.isPending ? "Сохраняем…" : "Запланировать"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Запланированные запуски</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {list.isLoading ? (
            <div className="p-6 text-center text-muted-foreground">Загрузка…</div>
          ) : !list.data?.items.length ? (
            <div className="p-6 text-center text-muted-foreground">
              Пока ничего не запланировано
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
                  <th className="text-left p-3">Название</th>
                  <th className="text-left p-3">Сценарий</th>
                  <th className="text-left p-3">Когда</th>
                  <th className="text-left p-3">Статус</th>
                  <th className="text-right p-3">Запущено</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((s) => {
                  const dt = new Date(s.scheduledAt);
                  return (
                    <tr key={s.id} className="border-b align-top">
                      <td className="p-3">
                        <div className="font-medium">{s.name}</div>
                        {s.lastError && (
                          <div className="text-xs text-red-600 flex items-start gap-1 mt-1">
                            <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                            <span className="line-clamp-2">{s.lastError}</span>
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {s.flowName}
                      </td>
                      <td className="p-3 font-mono text-xs">
                        {dt.toLocaleString("ru-RU", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </td>
                      <td className="p-3">
                        <Badge
                          className={STATUS_BADGE[s.status] ?? ""}
                          variant="outline"
                        >
                          {STATUS_LABEL[s.status] ?? s.status}
                        </Badge>
                      </td>
                      <td className="p-3 text-right font-mono">
                        {s.totalLaunched}
                        {s.totalFailed > 0 && (
                          <span className="text-red-600 text-xs">
                            {" "}
                            (−{s.totalFailed})
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (
                              confirm(
                                s.status === "scheduled"
                                  ? "Отменить этот запуск?"
                                  : "Удалить запись из истории?"
                              )
                            ) {
                              remove.mutate(s.id);
                            }
                          }}
                        >
                          <Trash2 className="h-3 w-3 text-red-500" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
