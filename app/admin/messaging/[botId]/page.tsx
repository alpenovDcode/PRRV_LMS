"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";

/**
 * Страница «Обзор» для одного MAX/мессенджер-бота.
 *
 * Аналог /admin/bots/[botId]/page.tsx у TG, но без блоков «состояние
 * вебхука» и «токен валиден / совпадает с записью» — у MAX/IG нет
 * прямого аналога Telegram.getMe()/getWebhookInfo, поэтому health-check
 * вынесем в отдельный этап (см. MAXUI-FUTURE).
 *
 * Что показываем:
 *   • 4 карточки: Подписчиков / Активны за 7д / Новых за день / В ручном
 *     управлении (operator takeover).
 *   • Сообщения за сутки (получено / отправлено).
 *   • Топ-теги подписчиков.
 *
 * Данные грузим через /admin/messaging/bots/[id]/overview, refetch
 * каждые 30 секунд (как у TG).
 */

interface OverviewData {
  subscribers: { total: number; activeWeek: number; newDay: number; takeover: number };
  messages: { sentDay: number; receivedDay: number };
  topTags: Array<{ tag: string; count: number }>;
}

interface HealthData {
  channel: "telegram" | "instagram" | "max";
  isActive: boolean;
  tokenValid: boolean;
  tokenMatches: boolean;
  tokenError: string | null;
  botName: string | null;
  externalAccountId: string;
  tokenExpiresAt: string | null;
  lastInboundAt: string | null;
}

export default function MessagingBotOverviewPage() {
  const params = useParams<{ botId: string }>();
  const botId = params.botId;

  const { data, isLoading } = useQuery({
    queryKey: ["messaging-bot-overview", botId],
    queryFn: async () => {
      const r = await apiClient.get(`/admin/messaging/bots/${botId}/overview`);
      return r.data?.data as OverviewData;
    },
    refetchInterval: 30_000,
  });

  // Health-check делает реальный HTTP к MAX — не автообновляем, юзер
  // дёргает «Обновить». Открытие страницы тоже триггерит один запрос.
  const {
    data: health,
    isFetching: healthFetching,
    refetch: refetchHealth,
  } = useQuery({
    queryKey: ["messaging-bot-health", botId],
    queryFn: async () => {
      const r = await apiClient.get(`/admin/messaging/bots/${botId}/health`);
      return r.data?.data as HealthData;
    },
  });

  return (
    <div className="space-y-6">
      {/* Карточки сводки */}
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard
          label="Подписчиков"
          value={data?.subscribers.total ?? "—"}
          isLoading={isLoading}
        />
        <StatCard
          label="Активны за 7д"
          value={data?.subscribers.activeWeek ?? "—"}
          isLoading={isLoading}
        />
        <StatCard
          label="Новых за день"
          value={data?.subscribers.newDay ?? "—"}
          isLoading={isLoading}
        />
        <StatCard
          label="В ручном управлении"
          value={data?.subscribers.takeover ?? "—"}
          isLoading={isLoading}
          hint="Диалоги, взятые оператором через Inbox"
        />
      </div>

      {/* Сообщения за сутки + топ-теги в одну строку */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Сообщения за сутки</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row
              label="Отправлено ботом"
              value={data?.messages.sentDay ?? 0}
              isLoading={isLoading}
            />
            <Row
              label="Получено от пользователей"
              value={data?.messages.receivedDay ?? 0}
              isLoading={isLoading}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Топ-теги</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-sm text-muted-foreground">Загрузка…</div>
            ) : !data?.topTags?.length ? (
              <div className="text-sm text-muted-foreground">пока пусто</div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {data.topTags.map((t) => (
                  <Badge key={t.tag} variant="outline" className="gap-1">
                    {t.tag}
                    <span className="text-muted-foreground font-mono">
                      {t.count}
                    </span>
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Состояние бота — health-check. Запрос дёргает getMe() у MAX
          и смотрит, когда было последнее входящее. */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-violet-500" />
            Состояние бота
          </CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={() => refetchHealth()}
            disabled={healthFetching}
            className="gap-1 h-8"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${
                healthFetching ? "animate-spin" : ""
              }`}
            />
            Обновить
          </Button>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <HealthRow
            label="Токен валиден"
            ok={health?.tokenValid ?? null}
            okText={
              health?.botName
                ? `${health.botName} (${health.externalAccountId})`
                : "ответ получен"
            }
            errorText={
              health?.tokenError
                ? `Ошибка: ${health.tokenError.slice(0, 200)}`
                : "—"
            }
          />
          <HealthRow
            label="Токен совпадает с записью"
            ok={
              health
                ? health.tokenValid
                  ? health.tokenMatches
                  : null
                : null
            }
            okText="ok"
            errorText={
              health?.tokenValid
                ? "ID бота не совпадает с externalAccountId — токен возможно от другого бота"
                : "проверка пропущена"
            }
          />
          {health?.tokenExpiresAt && (
            <HealthRow
              label="Срок токена"
              ok={
                health.tokenExpiresAt
                  ? new Date(health.tokenExpiresAt).getTime() - Date.now() >
                    7 * 24 * 60 * 60 * 1000
                  : null
              }
              okText={`до ${new Date(
                health.tokenExpiresAt
              ).toLocaleDateString("ru-RU")}`}
              errorText={`истечёт ${new Date(
                health.tokenExpiresAt
              ).toLocaleDateString("ru-RU")} — пора обновлять`}
            />
          )}
          <HealthRow
            label="Последнее входящее"
            ok={
              health?.lastInboundAt
                ? Date.now() - new Date(health.lastInboundAt).getTime() <
                  24 * 60 * 60 * 1000
                : null
            }
            okText={
              health?.lastInboundAt
                ? new Date(health.lastInboundAt).toLocaleString("ru-RU")
                : "—"
            }
            errorText={
              health?.lastInboundAt
                ? `${new Date(
                    health.lastInboundAt
                  ).toLocaleString("ru-RU")} — давно не пишут`
                : "ни одного входящего за всё время"
            }
          />
          {!health?.isActive && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5" />
              Бот отключён в админке — обработка входящих остановлена.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Одна строка health-чека. ok=true рендерим зелёным с галочкой, false —
 * красным с крестиком, null — серым с дефисом (проверка не выполнялась
 * или пока загружается).
 */
function HealthRow({
  label,
  ok,
  okText,
  errorText,
}: {
  label: string;
  ok: boolean | null;
  okText: string;
  errorText: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-center gap-2">
        {ok === true ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        ) : ok === false ? (
          <XCircle className="h-4 w-4 text-rose-600" />
        ) : (
          <div className="h-4 w-4 rounded-full bg-zinc-200" />
        )}
        <span>{label}</span>
      </div>
      <span
        className={
          ok === true
            ? "text-xs text-emerald-700"
            : ok === false
              ? "text-xs text-rose-700"
              : "text-xs text-muted-foreground"
        }
      >
        {ok === false ? errorText : okText}
      </span>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  isLoading,
}: {
  label: string;
  value: number | string;
  hint?: string;
  isLoading: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="text-3xl font-semibold">
          {isLoading
            ? "…"
            : typeof value === "number"
              ? value.toLocaleString("ru-RU")
              : value}
        </div>
        {hint && (
          <div className="text-[11px] text-muted-foreground mt-1">{hint}</div>
        )}
      </CardContent>
    </Card>
  );
}

function Row({
  label,
  value,
  isLoading,
}: {
  label: string;
  value: number;
  isLoading: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">
        {isLoading ? "…" : value.toLocaleString("ru-RU")}
      </span>
    </div>
  );
}
