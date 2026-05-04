"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Send, AlertTriangle, Mail, Bell, Download, Eye } from "lucide-react";

const ROLES = [
  { value: "student", label: "Студенты" },
  { value: "curator", label: "Кураторы" },
  { value: "admin", label: "Администраторы" },
];
const TARIFFS = [
  { value: "VR", label: "Востребованный" },
  { value: "LR", label: "Лидер рынка" },
  { value: "SR", label: "Самостоятельный" },
];
const TRACKS = [
  "Заполнить расписание",
  "Стать репетитором",
  "Перейти в онлайн",
  "Повысить чек",
  "Перейти на группы",
];

function toggle<T>(arr: T[], v: T): T[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

export default function BroadcastsPage() {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [channels, setChannels] = useState<string[]>(["lms"]);
  const [roles, setRoles] = useState<string[]>([]);
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [tariffs, setTariffs] = useState<string[]>([]);
  const [tracks, setTracks] = useState<string[]>([]);
  const [openLogId, setOpenLogId] = useState<string | null>(null);

  const { data: groupsData } = useQuery({
    queryKey: ["admin-groups"],
    queryFn: async () => {
      const r = await apiClient.get("/admin/groups");
      return r.data.data;
    },
  });

  const { data: historyData } = useQuery({
    queryKey: ["admin-broadcasts-history"],
    queryFn: async () => {
      const r = await apiClient.get("/admin/broadcasts");
      return r.data.data;
    },
  });

  const groups = (Array.isArray(groupsData) ? groupsData : groupsData?.groups || groupsData?.items || []) as any[];
  const history = (historyData?.items || []) as any[];

  const broadcastMutation = useMutation({
    mutationFn: async () => {
      const targets: any = {};
      if (roles.length) targets.roles = roles;
      if (groupIds.length) targets.groupIds = groupIds;
      if (tariffs.length) targets.tariffs = tariffs;
      if (tracks.length) targets.tracks = tracks;

      const response = await apiClient.post("/admin/broadcasts", {
        title,
        message,
        channels,
        targets,
      });
      return response.data.data;
    },
    onSuccess: (data) => {
      toast.success(`Рассылка отправлена ${data.recipientCount} пользователям (${data.channels.join(", ")})`);
      setTitle("");
      setMessage("");
      setRoles([]);
      setGroupIds([]);
      setTariffs([]);
      setTracks([]);
      queryClient.invalidateQueries({ queryKey: ["admin-broadcasts-history"] });
    },
    onError: () => {
      toast.error("Не удалось отправить рассылку");
    },
  });

  const noTargets = roles.length + groupIds.length + tariffs.length + tracks.length === 0;
  const disabled = !title || !message || channels.length === 0 || noTargets || broadcastMutation.isPending;

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8 space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-lg bg-blue-100 flex items-center justify-center">
          <Send className="h-6 w-6 text-blue-600" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Массовые рассылки</h1>
          <p className="text-gray-600">Отправка уведомлений в LMS и на почту</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Новая рассылка</CardTitle>
            <CardDescription>Уведомление приходит в личном кабинете и/или на email</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="title">Заголовок</Label>
              <Input id="title" placeholder="Важное объявление" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>Каналы доставки</Label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox checked={channels.includes("lms")} onCheckedChange={() => setChannels((c) => toggle(c, "lms"))} />
                  <Bell className="h-4 w-4 text-blue-600" />
                  <span>LMS-уведомление</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox checked={channels.includes("email")} onCheckedChange={() => setChannels((c) => toggle(c, "email"))} />
                  <Mail className="h-4 w-4 text-emerald-600" />
                  <span>Email</span>
                </label>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Роли</Label>
              <div className="flex flex-wrap gap-2">
                {ROLES.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setRoles((s) => toggle(s, r.value))}
                    className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                      roles.includes(r.value) ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-700 border-gray-300 hover:border-gray-400"
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Группы (потоки)</Label>
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-2 border rounded-md">
                {groups.length === 0 && <span className="text-sm text-gray-500">Нет групп</span>}
                {groups.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setGroupIds((s) => toggle(s, g.id))}
                    className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                      groupIds.includes(g.id) ? "bg-purple-600 text-white border-purple-600" : "bg-white text-gray-700 border-gray-300 hover:border-gray-400"
                    }`}
                  >
                    {g.name} ({g._count?.members ?? 0})
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Тарифы</Label>
              <div className="flex flex-wrap gap-2">
                {TARIFFS.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setTariffs((s) => toggle(s, t.value))}
                    className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                      tariffs.includes(t.value) ? "bg-amber-600 text-white border-amber-600" : "bg-white text-gray-700 border-gray-300 hover:border-gray-400"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Треки</Label>
              <div className="flex flex-wrap gap-2">
                {TRACKS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTracks((s) => toggle(s, t))}
                    className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                      tracks.includes(t) ? "bg-teal-600 text-white border-teal-600" : "bg-white text-gray-700 border-gray-300 hover:border-gray-400"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="message">Сообщение</Label>
              <Textarea
                id="message"
                placeholder="Текст уведомления..."
                className="min-h-[150px]"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>

            <div className="pt-2">
              <Button className="w-full bg-blue-600 hover:bg-blue-700" onClick={() => broadcastMutation.mutate()} disabled={disabled}>
                <Send className="mr-2 h-4 w-4" />
                {broadcastMutation.isPending ? "Отправка..." : "Отправить рассылку"}
              </Button>
              {noTargets && <p className="text-xs text-amber-600 mt-2">Выберите хотя бы одну роль / группу / тариф / трек</p>}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="bg-yellow-50 border-yellow-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-yellow-800 flex items-center gap-2 text-lg">
                <AlertTriangle className="h-5 w-5" />
                Важно
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-yellow-700 space-y-2">
              <p>Email отправляется батчами по 50 — для крупных рассылок отправка может занять несколько минут.</p>
              <p>Аудитория объединяет всех пользователей, попадающих в любой из выбранных фильтров.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">История рассылок</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 max-h-[500px] overflow-y-auto">
              {history.length === 0 && <p className="text-sm text-gray-500">Пока пусто</p>}
              {history.map((b: any) => (
                <button
                  key={b.id}
                  onClick={() => setOpenLogId(b.id)}
                  className="w-full text-left border-b pb-3 last:border-b-0 hover:bg-gray-50 rounded p-2 -m-2 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium text-sm">{b.title}</div>
                    <Eye className="h-4 w-4 text-gray-400 shrink-0" />
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {new Date(b.sentAt).toLocaleString("ru-RU")} · {b.author?.fullName || b.author?.email}
                  </div>
                  <div className="text-xs text-gray-600 mt-1">
                    {b.channels.join(", ")} · получателей {b.recipients} · отправлено {b.sentCount}
                    {b.failedCount > 0 && <span className="text-red-600"> · ошибок {b.failedCount}</span>}
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <BroadcastLogDialog id={openLogId} onClose={() => setOpenLogId(null)} />
    </div>
  );
}

function BroadcastLogDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["broadcast-log", id],
    queryFn: async () => (await apiClient.get(`/admin/broadcasts/${id}`)).data.data,
    enabled: !!id,
  });
  const broadcast = data?.broadcast;
  const logs = (broadcast?.recipientLogs || []) as any[];

  const [statusFilter, setStatusFilter] = useState<"all" | "sent" | "failed" | "skipped">("all");

  const filtered = logs.filter((l: any) => {
    if (statusFilter === "all") return true;
    return l.lmsStatus === statusFilter || l.emailStatus === statusFilter;
  });

  const statusBadge = (s: string | null | undefined) => {
    if (!s) return <span className="text-gray-300">—</span>;
    const colors: Record<string, string> = {
      sent: "bg-emerald-100 text-emerald-800",
      failed: "bg-red-100 text-red-800",
      skipped: "bg-gray-100 text-gray-700",
      pending: "bg-amber-100 text-amber-800",
    };
    return <Badge className={(colors[s] || "bg-gray-100 text-gray-700") + " border-0"}>{s}</Badge>;
  };

  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{broadcast?.title || "Лог рассылки"}</DialogTitle>
        </DialogHeader>
        {isLoading && <p className="text-sm text-gray-500">Загрузка...</p>}
        {broadcast && (
          <>
            <div className="text-sm text-gray-600 space-y-1">
              <div>
                Каналы: <strong>{broadcast.channels.join(", ")}</strong> · Отправлено:{" "}
                <strong>{broadcast.sentCount}</strong> / {broadcast.recipients}
                {broadcast.failedCount > 0 && <span className="text-red-600"> · ошибок {broadcast.failedCount}</span>}
              </div>
              <div className="text-xs text-gray-500">
                {new Date(broadcast.sentAt).toLocaleString("ru-RU")} · {broadcast.author?.fullName || broadcast.author?.email}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-2 pb-1 border-b">
              <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                {(["all", "sent", "failed", "skipped"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={
                      "px-3 py-1 text-xs rounded-md transition-colors " +
                      (statusFilter === s ? "bg-white shadow text-gray-900" : "text-gray-600 hover:text-gray-900")
                    }
                  >
                    {s === "all" ? `Все (${logs.length})` : s}
                  </button>
                ))}
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => window.open(`/api/admin/broadcasts/${broadcast.id}/export`, "_blank")}
              >
                <Download className="h-4 w-4 mr-1" /> CSV
              </Button>
            </div>

            <div className="overflow-y-auto flex-1">
              <table className="w-full text-sm">
                <thead className="text-left text-gray-600 border-b sticky top-0 bg-white">
                  <tr>
                    <th className="py-2 pr-4">Получатель</th>
                    <th className="py-2 pr-4">Email</th>
                    <th className="py-2 pr-4">Роль</th>
                    <th className="py-2 pr-4">LMS</th>
                    <th className="py-2 pr-4">Email</th>
                    <th className="py-2 pr-4">Ошибка</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={6} className="py-4 text-gray-500 text-center">Нет записей</td></tr>
                  ) : filtered.map((l: any) => (
                    <tr key={l.id} className="border-b last:border-b-0">
                      <td className="py-2 pr-4">{l.user?.fullName || "—"}</td>
                      <td className="py-2 pr-4 text-gray-600">{l.email || l.user?.email || "—"}</td>
                      <td className="py-2 pr-4 text-gray-600">{l.user?.role}</td>
                      <td className="py-2 pr-4">{statusBadge(l.lmsStatus)}</td>
                      <td className="py-2 pr-4">{statusBadge(l.emailStatus)}</td>
                      <td className="py-2 pr-4 text-xs text-red-600 max-w-[200px] truncate" title={l.errorMessage || ""}>
                        {l.errorMessage || ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
