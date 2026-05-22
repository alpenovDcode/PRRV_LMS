"use client";

// Карточка лида с вкладками: Профиль / История / Маркетинг.
// Профиль — управление (теги, переменные, запуск сценариев).
// История — журнал воронок и таймлайн событий.
// Маркетинг — конверсия, A/B, клики, UTM, рассылки.

import { useState } from "react";
import { cn } from "@/lib/utils";
import { User, History, TrendingUp } from "lucide-react";
import {
  LeadSidebar,
  type SubscriberDetail,
  type ActiveRun,
} from "./lead-sidebar";
import { LeadHistory } from "./lead-history";
import { LeadMarketing } from "./lead-marketing";

interface Props {
  botId: string;
  subscriberId: string;
  subscriber: SubscriberDetail;
  activeRuns: ActiveRun[];
}

type Tab = "profile" | "history" | "marketing";

const TABS: Array<{ id: Tab; label: string; icon: typeof User }> = [
  { id: "profile", label: "Профиль", icon: User },
  { id: "history", label: "История", icon: History },
  { id: "marketing", label: "Маркетинг", icon: TrendingUp },
];

export function LeadDossier({
  botId,
  subscriberId,
  subscriber,
  activeRuns,
}: Props) {
  const [tab, setTab] = useState<Tab>("profile");

  return (
    <div className="space-y-3">
      {/* Переключатель вкладок */}
      <div className="flex gap-1 rounded-lg border bg-card p-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                active
                  ? "bg-purple-600 text-white"
                  : "text-zinc-500 hover:bg-zinc-100"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Контент вкладки. Профиль (LeadSidebar) уже несёт свою рамку
          <aside>; История/Маркетинг оборачиваем для единого вида. */}
      {tab === "profile" && (
        <LeadSidebar
          botId={botId}
          subscriberId={subscriberId}
          subscriber={subscriber}
          activeRuns={activeRuns}
        />
      )}
      {tab === "history" && (
        <div className="rounded-lg border bg-card p-4">
          <LeadHistory botId={botId} subscriberId={subscriberId} />
        </div>
      )}
      {tab === "marketing" && (
        <div className="rounded-lg border bg-card p-4">
          <LeadMarketing botId={botId} subscriberId={subscriberId} />
        </div>
      )}
    </div>
  );
}
