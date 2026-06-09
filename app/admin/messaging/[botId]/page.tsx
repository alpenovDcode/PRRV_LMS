"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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

      {/* Пояснение о будущих фичах. Этап B заменит это конкретными
          блоками: «Состояние вебхука», «Логи», «Расписание». */}
      <Card className="border-dashed bg-muted/30">
        <CardContent className="py-4 text-xs text-muted-foreground">
          В ближайших обновлениях этой страницы появятся: состояние
          вебхука MAX, расписание сценариев и логи событий — по аналогии
          с разделом Telegram-бота.
        </CardContent>
      </Card>
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
