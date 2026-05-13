"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, RefreshCw, Trash2, Plus } from "lucide-react";

interface BotDetail {
  bot: {
    id: string;
    username: string;
    title: string;
    isActive: boolean;
    subscriberCount: number;
    webhookUrl: string | null;
    tokenPrefix: string;
    defaultStartFlowId: string | null;
    adminChatIds: string[];
    timezone: string | null;
  };
  webhookInfo: {
    url: string;
    pending_update_count: number;
    last_error_message?: string;
    last_error_date?: number;
  } | null;
  webhookError: string | null;
}

interface StatsData {
  subscribers: { total: number; activeWeek: number; newDay: number; blocked: number };
  messages: { sentDay: number; receivedDay: number };
  topTags: Array<{ tag: string; count: number }>;
  recentEvents: Array<{ id: string; type: string; properties: any; occurredAt: string }>;
}

export default function BotOverviewPage() {
  const params = useParams<{ botId: string }>();
  const botId = params.botId;
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["tg-bot-detail", botId],
    queryFn: async () => {
      const r = await apiClient.get(`/admin/tg/bots/${botId}`);
      return r.data?.data as BotDetail;
    },
  });

  const { data: stats } = useQuery({
    queryKey: ["tg-bot-events", botId],
    queryFn: async () => {
      const r = await apiClient.get(`/admin/tg/bots/${botId}/events`);
      return r.data?.data as StatsData;
    },
    refetchInterval: 30_000,
  });

  const refresh = useMutation({
    mutationFn: async () => apiClient.patch(`/admin/tg/bots/${botId}`, { refreshWebhook: true }),
    onSuccess: () => {
      toast.success("Вебхук обновлён");
      queryClient.invalidateQueries({ queryKey: ["tg-bot-detail", botId] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.error?.message || "Ошибка"),
  });

  const remove = useMutation({
    mutationFn: async () => apiClient.delete(`/admin/tg/bots/${botId}`),
    onSuccess: () => {
      toast.success("Бот отключён");
      window.location.href = "/admin/bots";
    },
  });

  const toggleActive = useMutation({
    mutationFn: async (isActive: boolean) =>
      apiClient.patch(`/admin/tg/bots/${botId}`, { isActive }),
    onSuccess: () => {
      toast.success("Сохранено");
      queryClient.invalidateQueries({ queryKey: ["tg-bot-detail", botId] });
    },
  });

  const webhookHealth = data?.webhookInfo?.last_error_message
    ? { ok: false, msg: data.webhookInfo.last_error_message }
    : data?.webhookInfo?.url
      ? { ok: true, msg: data.webhookInfo.url }
      : { ok: false, msg: "Вебхук не зарегистрирован" };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Подписчиков" value={stats?.subscribers.total ?? "—"} />
        <StatCard label="Активны за 7д" value={stats?.subscribers.activeWeek ?? "—"} />
        <StatCard label="Новых за день" value={stats?.subscribers.newDay ?? "—"} />
        <StatCard label="Заблокировали" value={stats?.subscribers.blocked ?? "—"} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Сообщения за сутки</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Отправлено ботом</span>
              <span className="font-medium">{stats?.messages.sentDay ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span>Получено от пользователей</span>
              <span className="font-medium">{stats?.messages.receivedDay ?? "—"}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Топ-теги</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {!stats?.topTags?.length ? (
              <div className="text-muted-foreground">пока пусто</div>
            ) : (
              stats.topTags.map((t) => (
                <div key={t.tag} className="flex justify-between">
                  <Badge variant="secondary">{t.tag}</Badge>
                  <span>{t.count}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Состояние вебхука</CardTitle>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => refresh.mutate()}
              disabled={refresh.isPending}
            >
              <RefreshCw className="mr-2 h-3 w-3" />
              Переустановить
            </Button>
            <Button
              size="sm"
              variant={data?.bot.isActive ? "outline" : "default"}
              onClick={() => toggleActive.mutate(!data?.bot.isActive)}
            >
              {data?.bot.isActive ? "Выключить" : "Включить"}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                if (confirm("Отключить бота полностью? Подписчики останутся в БД.")) {
                  remove.mutate();
                }
              }}
            >
              <Trash2 className="mr-2 h-3 w-3" /> Удалить
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            {webhookHealth.ok ? (
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-amber-500" />
            )}
            <span className="break-all">{webhookHealth.msg}</span>
          </div>
          {data?.webhookInfo?.pending_update_count != null && (
            <div className="text-muted-foreground">
              В очереди у Telegram: {data.webhookInfo.pending_update_count}
            </div>
          )}
          {data?.bot.webhookUrl && (
            <div className="text-xs text-muted-foreground break-all">
              URL: {data.bot.webhookUrl}
            </div>
          )}
        </CardContent>
      </Card>

      {data?.bot && <MediaCaptureSettings bot={data.bot} botId={botId} />}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Последние события</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {!stats?.recentEvents?.length ? (
            <div className="text-muted-foreground">пусто</div>
          ) : (
            stats.recentEvents.map((e) => (
              <div key={e.id} className="flex items-center justify-between border-b py-1 last:border-0">
                <span className="font-mono text-xs">{e.type}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(e.occurredAt).toLocaleString("ru-RU")}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}

// Auto-capture settings — admin chat_ids whose media inbound is saved
// into the bot's media library. This is the bot-platform equivalent of
// SaleBot's "получи file_id, отправив боту медиа" workflow.
function MediaCaptureSettings({
  bot,
  botId,
}: {
  bot: BotDetail["bot"];
  botId: string;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const save = useMutation({
    mutationFn: async (adminChatIds: string[]) =>
      apiClient.patch(`/admin/tg/bots/${botId}`, { adminChatIds }),
    onSuccess: () => {
      toast.success("Сохранено");
      queryClient.invalidateQueries({ queryKey: ["tg-bot-detail", botId] });
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.error?.message || "Ошибка"),
  });
  const ids = bot.adminChatIds;

  const add = () => {
    const v = draft.trim();
    if (!v || !/^-?\d+$/.test(v)) {
      toast.error("Только цифры, можно с минусом для каналов/чатов");
      return;
    }
    if (ids.includes(v)) {
      toast.error("Уже в списке");
      return;
    }
    save.mutate([...ids, v]);
    setDraft("");
  };
  const remove = (id: string) => save.mutate(ids.filter((x) => x !== id));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Авто-захват медиа</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          Когда любой админ из этого списка отправляет медиа в этот бот,
          оно автоматически сохраняется в библиотеку с file_id и становится
          доступно в редакторе сообщений. Свой chat_id можно узнать у{" "}
          <a
            href={`https://t.me/${bot.username}`}
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            @{bot.username}
          </a>{" "}
          или у любого служебного бота типа <code>@userinfobot</code>.
        </p>
        <div className="flex flex-wrap gap-2">
          {ids.length === 0 ? (
            <span className="text-muted-foreground italic text-xs">
              Список пуст — авто-захват выключен.
            </span>
          ) : (
            ids.map((id) => (
              <Badge
                key={id}
                variant="secondary"
                className="font-mono pr-1 flex items-center gap-1"
              >
                {id}
                <button
                  type="button"
                  onClick={() => remove(id)}
                  className="text-zinc-500 hover:text-red-600"
                >
                  ×
                </button>
              </Badge>
            ))
          )}
        </div>
        <div className="flex gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="chat_id, например 73704021"
            className="font-mono"
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
            }}
          />
          <Button onClick={add} disabled={save.isPending}>
            <Plus className="mr-1 h-3 w-3" /> Добавить
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
