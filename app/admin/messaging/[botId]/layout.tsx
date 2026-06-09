"use client";

import Link from "next/link";
import { usePathname, useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import {
  MessageSquare,
  Workflow,
  Send,
  Link2,
  BarChart3,
  LineChart,
  ListChecks,
  FormInput,
  Inbox,
  Plug,
  FileText,
} from "lucide-react";

/**
 * Layout для страниц одного MAX/мессенджер-бота.
 *
 * Скопирован по образу /admin/bots/[botId]/layout.tsx (TG) — одинаковый
 * UX: иконка, заголовок, строка табов под подчёркиванием. Различия:
 *   • Иконка MessageSquare вместо Bot (MAX визуально отличается).
 *   • Под title — externalAccountId (а не @username): у MAX нет username
 *     в привычном TG-смысле; на MessagingBot хранится bot_id из MAX.
 *   • Меньше табов: у MAX пока нет аналогов «Подписчики» (chat-style),
 *     «Расписание» (нет TgScheduledFlow → MessagingScheduledFlow) и
 *     «Логи». Когда добавим бэк — табы расширим.
 *
 * Замечание про URL: подстраница «Ссылки/UTM» исторически живёт на
 * /tracking. URL не меняем (есть закладки и существующие фронт-ссылки),
 * но в лейбле таба пишем «Ссылки/UTM» — для соответствия TG.
 */
export default function MessagingBotDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams<{ botId: string }>();
  const pathname = usePathname();
  const botId = params.botId;

  const { data: bot } = useQuery({
    queryKey: ["messaging-bot", botId],
    queryFn: async () => {
      const r = await apiClient.get(`/admin/messaging/bots/${botId}`);
      return r.data?.data as {
        id: string;
        channel: "telegram" | "instagram" | "max";
        externalAccountId: string;
        title: string;
        isActive: boolean;
        subscriberCount: number;
        meta: any;
      };
    },
    enabled: !!botId,
  });

  // Метка канала под заголовком — чтобы быстро отличать MAX от Instagram
  // в шапке (на проде Instagram скрыт в UI, но запись в БД может быть).
  const channelLabel =
    bot?.channel === "max"
      ? "МАКС"
      : bot?.channel === "instagram"
        ? "Instagram"
        : bot?.channel === "telegram"
          ? "Telegram"
          : "";

  const tabs = [
    { href: `/admin/messaging/${botId}`, label: "Обзор", icon: BarChart3 },
    { href: `/admin/messaging/${botId}/inbox`, label: "Inbox", icon: Inbox },
    { href: `/admin/messaging/${botId}/flows`, label: "Сценарии", icon: Workflow },
    { href: `/admin/messaging/${botId}/broadcasts`, label: "Рассылки", icon: Send },
    { href: `/admin/messaging/${botId}/lists`, label: "Списки", icon: ListChecks },
    { href: `/admin/messaging/${botId}/fields`, label: "Поля", icon: FormInput },
    { href: `/admin/messaging/${botId}/tracking`, label: "Ссылки/UTM", icon: Link2 },
    { href: `/admin/messaging/${botId}/analytics`, label: "Аналитика", icon: LineChart },
    { href: `/admin/messaging/${botId}/logs`, label: "Логи", icon: FileText },
    { href: `/admin/messaging/${botId}/bitrix`, label: "Bitrix24", icon: Plug },
  ];

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center gap-3">
        <MessageSquare className="h-6 w-6 text-blue-500" />
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            {bot?.title ?? "..."}
            {channelLabel && (
              <span className="text-[10px] uppercase tracking-wide bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded">
                {channelLabel}
              </span>
            )}
          </h1>
          <p className="text-sm text-muted-foreground">
            {bot?.externalAccountId ?? botId} ·{" "}
            {bot?.subscriberCount ?? 0} подписчиков
            {bot && !bot.isActive && (
              <span className="ml-2 text-xs text-amber-600">(отключён)</span>
            )}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b">
        {tabs.map((t) => {
          // Активность вычисляется так же как в TG-layout: index-таб
          // активен только при точном совпадении, остальные — по prefix.
          const isActive =
            pathname === t.href ||
            (t.href !== `/admin/messaging/${botId}` &&
              pathname.startsWith(t.href));
          const Icon = t.icon;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={cn(
                "px-3 py-2 text-sm rounded-t border-b-2 -mb-px flex items-center gap-2",
                isActive
                  ? "border-primary text-primary font-medium bg-primary/5"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </Link>
          );
        })}
      </div>

      <div>{children}</div>
    </div>
  );
}
