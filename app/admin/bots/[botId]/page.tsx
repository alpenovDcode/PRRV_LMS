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
import { AlertTriangle, CheckCircle2, RefreshCw, Trash2, Plus, ShieldCheck, Activity, KeyRound, RotateCcw } from "lucide-react";

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

      <BotHealthCard botId={botId} />

      <CronStatusCard />

      {data?.bot && <SecretRotationCard bot={data.bot} botId={botId} />}

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

// Health-check: вызывает Telegram getMe+getWebhookInfo и сравнивает с
// тем, что лежит в БД. Любой mismatch — повод для админа залезть и
// проверить настройки до того, как боты сами поломаются ночью.
interface HealthData {
  checkedAt: string;
  token: {
    ok: boolean;
    matchesBot: boolean;
    tgUsername: string | null;
    tgId: number | null;
    description: string | null;
  };
  webhook: {
    ok: boolean;
    url: string | null;
    pendingUpdateCount: number;
    lastErrorDate: number | null;
    lastErrorMessage: string | null;
    matchesBot: boolean;
  };
  issues: Array<{ severity: "warn" | "error"; code: string; message: string }>;
}

function BotHealthCard({ botId }: { botId: string }) {
  const { data, isFetching, refetch } = useQuery({
    queryKey: ["tg-bot-health", botId],
    queryFn: async () => {
      const r = await apiClient.get(`/admin/tg/bots/${botId}/health`);
      return r.data?.data as HealthData;
    },
    refetchInterval: 5 * 60 * 1000, // раз в 5 минут пинаем
  });
  const errors = data?.issues.filter((i) => i.severity === "error") ?? [];
  const warns = data?.issues.filter((i) => i.severity === "warn") ?? [];
  const allGreen = data && errors.length === 0 && warns.length === 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldCheck
            className={`h-4 w-4 ${
              allGreen ? "text-green-600" : errors.length ? "text-red-600" : "text-amber-500"
            }`}
          />
          Состояние бота в Telegram
        </CardTitle>
        <Button
          variant="ghost"
          size="sm"
          disabled={isFetching}
          onClick={() => refetch()}
        >
          <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {!data ? (
          <div className="text-muted-foreground">Проверяем…</div>
        ) : (
          <>
            <HealthRow
              label="Токен валиден"
              ok={data.token.ok}
              detail={
                data.token.ok
                  ? `@${data.token.tgUsername}`
                  : data.token.description ?? "getMe не сработал"
              }
            />
            <HealthRow
              label="Токен совпадает с записью"
              ok={data.token.matchesBot}
              detail={
                data.token.matchesBot
                  ? "ok"
                  : "username/id из Telegram отличается от сохранённого"
              }
            />
            <HealthRow
              label="Webhook установлен"
              ok={data.webhook.ok}
              detail={data.webhook.url ?? "пусто"}
            />
            {data.webhook.url && (
              <HealthRow
                label="Webhook на нашем URL"
                ok={data.webhook.matchesBot}
                detail={data.webhook.matchesBot ? "ok" : data.webhook.url ?? ""}
              />
            )}
            {data.webhook.pendingUpdateCount > 0 && (
              <div className="text-xs text-muted-foreground">
                В очереди Telegram: {data.webhook.pendingUpdateCount}
              </div>
            )}
            {data.webhook.lastErrorMessage && (
              <div className="text-xs text-amber-700">
                <AlertTriangle className="inline h-3 w-3 mr-1" />
                Последняя ошибка webhook:{" "}
                <span className="font-mono">{data.webhook.lastErrorMessage}</span>
              </div>
            )}
            <div className="text-[10px] text-muted-foreground pt-1">
              Проверено: {new Date(data.checkedAt).toLocaleString("ru-RU")}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// Cron heartbeat — глобальный (не per-bot), показывает «крон живой»
// и сколько он намолотил на последнем тике.
interface CronStatus {
  alive: boolean;
  lastTickAt: string | null;
  ageMs: number | null;
  lastTick: {
    runs: number;
    broadcasts: number;
    scheduledFlows: number;
    durationMs: number;
  } | null;
  staleThresholdMs: number;
  source: "redis" | "db" | "none";
}

function CronStatusCard() {
  const { data, isFetching, refetch } = useQuery({
    queryKey: ["tg-cron-status"],
    queryFn: async () => {
      const r = await apiClient.get(`/admin/tg/cron-status`);
      return r.data?.data as CronStatus;
    },
    refetchInterval: 60_000, // раз в минуту
  });

  const ageLabel = (() => {
    if (!data?.ageMs) return data?.lastTickAt ? "только что" : "—";
    const sec = Math.floor(data.ageMs / 1000);
    if (sec < 60) return `${sec} сек назад`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min} мин назад`;
    return `${Math.floor(min / 60)} ч назад`;
  })();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <Activity
            className={`h-4 w-4 ${data?.alive ? "text-green-600" : "text-red-600"}`}
          />
          Состояние крона
        </CardTitle>
        <Button
          variant="ghost"
          size="sm"
          disabled={isFetching}
          onClick={() => refetch()}
        >
          <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {!data ? (
          <div className="text-muted-foreground">Загрузка…</div>
        ) : !data.lastTickAt ? (
          <div className="text-red-600">
            <AlertTriangle className="inline h-4 w-4 mr-1" />
            Cron никогда не пинговал. Проверьте, что внешний планировщик
            (Vercel Cron / docker / curl) бьёт <code>/api/tg-cron/tick</code> с
            корректным <code>TG_CRON_SECRET</code>.
          </div>
        ) : data.alive ? (
          <>
            <div className="flex items-center gap-2 text-green-700">
              <CheckCircle2 className="h-4 w-4" /> Cron жив, последний тик{" "}
              {ageLabel}
            </div>
            {data.lastTick && (
              <div className="text-xs text-muted-foreground">
                runs={data.lastTick.runs} · broadcasts={data.lastTick.broadcasts}{" "}
                · scheduledFlows={data.lastTick.scheduledFlows} ·{" "}
                {data.lastTick.durationMs} мс
              </div>
            )}
          </>
        ) : (
          <div className="text-red-600">
            <AlertTriangle className="inline h-4 w-4 mr-1" />
            Cron молчит уже {ageLabel}. delay/wait_reply таймауты не
            отрабатывают, рассылки не идут. Проверь внешний планировщик.
          </div>
        )}
        <div className="text-[10px] text-muted-foreground">
          Порог тревоги: {Math.round(data?.staleThresholdMs ? data.staleThresholdMs / 60_000 : 5)} мин
          {data?.source && data.source !== "none" && (
            <> · источник: <code>{data.source}</code></>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function HealthRow({
  label,
  ok,
  detail,
}: {
  label: string;
  ok: boolean;
  detail?: string;
}) {
  return (
    <div className="flex items-center justify-between text-sm border-b py-1 last:border-0">
      <div className="flex items-center gap-2">
        {ok ? (
          <CheckCircle2 className="h-4 w-4 text-green-600" />
        ) : (
          <AlertTriangle className="h-4 w-4 text-red-500" />
        )}
        <span>{label}</span>
      </div>
      <span className="text-xs text-muted-foreground font-mono truncate ml-3 max-w-[60%]">
        {detail}
      </span>
    </div>
  );
}

// Auto-capture settings — admin chat_ids whose media inbound is saved
// into the bot's media library. This is the bot-platform equivalent of
// SaleBot's "получи file_id, отправив боту медиа" workflow.
// Ротация секретов — деликатная операция: меняем bot-token (после
// revoke в BotFather) или webhookSecret (если утёк / профилактика).
// Каждое действие требует явного подтверждения в диалоге.
function SecretRotationCard({
  bot,
  botId,
}: {
  bot: BotDetail["bot"];
  botId: string;
}) {
  const queryClient = useQueryClient();
  const [newToken, setNewToken] = useState("");
  const [showTokenInput, setShowTokenInput] = useState(false);

  const rotateToken = useMutation({
    mutationFn: async () => {
      const r = await apiClient.post(
        `/admin/tg/bots/${botId}/rotate-token`,
        { token: newToken.trim() }
      );
      return r.data;
    },
    onSuccess: () => {
      toast.success(
        "Токен обновлён. Webhook переустановлен — новые апдейты приходят на свежий токен."
      );
      setNewToken("");
      setShowTokenInput(false);
      queryClient.invalidateQueries({ queryKey: ["tg-bot-detail", botId] });
      queryClient.invalidateQueries({ queryKey: ["tg-bot-health", botId] });
    },
    onError: (e: { response?: { data?: { error?: { message?: string } } } }) => {
      toast.error(e?.response?.data?.error?.message ?? "Не удалось обновить");
    },
  });

  const rotateSecret = useMutation({
    mutationFn: async () => {
      const r = await apiClient.post(
        `/admin/tg/bots/${botId}/rotate-webhook-secret`
      );
      return r.data;
    },
    onSuccess: () => {
      toast.success(
        "Webhook secret обновлён. Старые подделки перестанут проходить."
      );
      queryClient.invalidateQueries({ queryKey: ["tg-bot-health", botId] });
    },
    onError: (e: { response?: { data?: { error?: { message?: string } } } }) => {
      toast.error(e?.response?.data?.error?.message ?? "Не удалось обновить");
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-amber-600" />
          Ротация секретов
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="space-y-2">
          <div className="font-medium">Bot-токен</div>
          <div className="text-xs text-muted-foreground">
            Текущий: <code className="font-mono">{bot.tokenPrefix}…</code>
          </div>
          {!showTokenInput ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowTokenInput(true)}
            >
              <RotateCcw className="h-3 w-3 mr-1" /> Заменить токен
            </Button>
          ) : (
            <div className="space-y-2 rounded border border-amber-300 bg-amber-50/40 p-3">
              <div className="text-xs text-amber-800">
                Получите новый токен в @BotFather через <code>/revoke</code>{" "}
                и <code>/token</code>. Менять можно только в пределах
                <span className="font-medium"> того же бота</span> — другой бот не
                примем.
              </div>
              <Input
                type="password"
                value={newToken}
                onChange={(e) => setNewToken(e.target.value)}
                placeholder="123456789:AAA…"
                className="font-mono text-xs"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={!newToken.trim() || rotateToken.isPending}
                  onClick={() => {
                    if (
                      confirm(
                        "Заменить bot-токен? Старый перестанет работать. Убедитесь, что новый получен через BotFather."
                      )
                    ) {
                      rotateToken.mutate();
                    }
                  }}
                >
                  {rotateToken.isPending ? "Меняем…" : "Сохранить"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setShowTokenInput(false);
                    setNewToken("");
                  }}
                >
                  Отмена
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-2 border-t pt-3">
          <div className="font-medium">Webhook secret</div>
          <div className="text-xs text-muted-foreground">
            Используется в <code>X-Telegram-Bot-Api-Secret-Token</code>: подделки
            webhook-апдейтов отбрасываются. Меняйте, если есть подозрение
            на утечку или профилактически раз в полгода.
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={rotateSecret.isPending}
            onClick={() => {
              if (
                confirm(
                  "Сгенерировать новый webhook secret? Старый сразу перестанет проходить — операция безопасна, но возьмёт ~1 сек."
                )
              ) {
                rotateSecret.mutate();
              }
            }}
          >
            <RotateCcw className="h-3 w-3 mr-1" />
            {rotateSecret.isPending ? "Меняем…" : "Сгенерировать новый"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

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
