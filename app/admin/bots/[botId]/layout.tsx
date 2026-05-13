"use client";

import Link from "next/link";
import { usePathname, useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Bot, Users, Workflow, Send, Link2, BarChart3, LineChart } from "lucide-react";

export default function BotDetailLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ botId: string }>();
  const pathname = usePathname();
  const botId = params.botId;

  const { data: bot } = useQuery({
    queryKey: ["tg-bot", botId],
    queryFn: async () => {
      const r = await apiClient.get(`/admin/tg/bots/${botId}`);
      return r.data?.data?.bot as {
        username: string;
        title: string;
        isActive: boolean;
        subscriberCount: number;
      };
    },
    enabled: !!botId,
  });

  const tabs = [
    { href: `/admin/bots/${botId}`, label: "Обзор", icon: BarChart3 },
    { href: `/admin/bots/${botId}/subscribers`, label: "Подписчики", icon: Users },
    { href: `/admin/bots/${botId}/flows`, label: "Сценарии", icon: Workflow },
    { href: `/admin/bots/${botId}/broadcasts`, label: "Рассылки", icon: Send },
    { href: `/admin/bots/${botId}/links`, label: "Ссылки/UTM", icon: Link2 },
    { href: `/admin/bots/${botId}/analytics`, label: "Аналитика", icon: LineChart },
  ];

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center gap-3">
        <Bot className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-semibold">{bot?.title ?? "..."}</h1>
          <p className="text-sm text-muted-foreground">
            @{bot?.username ?? botId} · {bot?.subscriberCount ?? 0} подписчиков
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b">
        {tabs.map((t) => {
          const isActive =
            pathname === t.href ||
            (t.href !== `/admin/bots/${botId}` && pathname.startsWith(t.href));
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
