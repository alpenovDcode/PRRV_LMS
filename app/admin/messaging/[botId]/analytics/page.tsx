"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
    Users,
  Zap,
  Send,
  MessageSquare,
  TrendingUp,
  BarChart3,
} from "lucide-react";

interface AnalyticsData {
  period: { days: number; since: string };
  totals: {
    subscribersTotal: number;
    subscribersNew: number;
    activeFlows: number;
    broadcastsToday: number;
    messagesIn: number;
    messagesOut: number;
  };
  eventsByType: { type: string; count: number }[];
  topTriggers: {
    id: string;
    type: string;
    keywords: string[];
    triggerCount: number;
    lastTriggeredAt: string | null;
    flow: { id: string; name: string };
  }[];
  topFlows: { id: string; name: string; starts: number }[];
  timeline: { day: string; count: number }[];
}

const EVENT_LABELS: Record<string, string> = {
  "subscriber.created": "Новые подписчики",
  "subscriber.lms_linked": "Привязка к LMS",
  "flow.started": "Запусков воронок",
  "flow.completed": "Завершено воронок",
  "flow.failed": "Ошибок в воронках",
  "flow.cancelled": "Отменено воронок",
  "trigger.matched": "Срабатываний триггеров",
  "message.inbound": "Входящих сообщений",
  "message.outbound": "Исходящих сообщений",
  "tag.added": "Добавлено тегов",
  "tag.removed": "Удалено тегов",
  "list.joined": "Вступлений в листы",
  "list.left": "Выходов из листов",
  "broadcast.started": "Запущено рассылок",
  "broadcast.completed": "Завершено рассылок",
  "broadcast.delivered": "Доставлено рассылок",
  "broadcast.failed": "Ошибок рассылок",
  "operator.takeover": "Захватов оператором",
  "operator.release": "Возвратов боту",
  "operator.replied": "Ответов оператора",
};

export default function AnalyticsPage() {
  const { botId } = useParams<{ botId: string }>();
  const [days, setDays] = useState(7);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetch(`/api/admin/messaging/bots/${botId}/analytics?days=${days}`)
      .then((r) => r.json())
      .then((d) => setData(d.data ?? null))
      .finally(() => setLoading(false));
  };

  useEffect(load, [botId, days]);

  const maxTimelineCount = Math.max(1, ...(data?.timeline.map((t) => t.count) ?? [0]));

  return (
    <div className="max-w-6xl mx-auto"><div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BarChart3 className="w-6 h-6" /> Аналитика
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Бот #{botId.slice(0, 8)}</p>
        </div>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
        >
          <option value={1}>За сутки</option>
          <option value={7}>За 7 дней</option>
          <option value={30}>За 30 дней</option>
          <option value={90}>За 90 дней</option>
        </select>
      </div>

      {loading || !data ? (
        <div className="p-8 text-center text-gray-400 text-sm">Загрузка…</div>
      ) : (
        <>
          {/* Totals */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
            <StatCard
              icon={<Users className="w-5 h-5 text-blue-500" />}
              label="Подписчиков всего"
              value={data.totals.subscribersTotal}
              sublabel={`+${data.totals.subscribersNew} за период`}
            />
            <StatCard
              icon={<Zap className="w-5 h-5 text-amber-500" />}
              label="Активных воронок"
              value={data.totals.activeFlows}
            />
            <StatCard
              icon={<Send className="w-5 h-5 text-green-500" />}
              label="Рассылок сегодня"
              value={data.totals.broadcastsToday}
            />
            <StatCard
              icon={<MessageSquare className="w-5 h-5 text-purple-500" />}
              label="Входящих"
              value={data.totals.messagesIn}
              sublabel={`за ${data.period.days} дней`}
            />
            <StatCard
              icon={<MessageSquare className="w-5 h-5 text-pink-500" />}
              label="Исходящих"
              value={data.totals.messagesOut}
              sublabel={`за ${data.period.days} дней`}
            />
            <StatCard
              icon={<TrendingUp className="w-5 h-5 text-cyan-500" />}
              label="Срабатываний триггеров"
              value={
                data.eventsByType.find((e) => e.type === "trigger.matched")?.count ?? 0
              }
              sublabel={`за ${data.period.days} дней`}
            />
          </div>

          {/* Timeline */}
          {data.timeline.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Активность по дням</h2>
              <div className="flex items-end gap-1 h-32">
                {data.timeline.map((t) => (
                  <div
                    key={t.day}
                    className="flex-1 flex flex-col items-center justify-end gap-1"
                    title={`${new Date(t.day).toLocaleDateString("ru-RU")}: ${t.count}`}
                  >
                    <span className="text-[10px] text-gray-400">{t.count}</span>
                    <div
                      className="w-full bg-blue-500 rounded-t"
                      style={{ height: `${(t.count / maxTimelineCount) * 100}%`, minHeight: "2px" }}
                    />
                    <span className="text-[10px] text-gray-400">
                      {new Date(t.day).toLocaleDateString("ru-RU", {
                        day: "2-digit",
                        month: "2-digit",
                      })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            {/* Events by type */}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">События</h2>
              {data.eventsByType.length === 0 ? (
                <div className="text-sm text-gray-400">Нет событий за период</div>
              ) : (
                <div className="space-y-1.5">
                  {data.eventsByType.map((e) => {
                    const max = Math.max(...data.eventsByType.map((x) => x.count));
                    return (
                      <div key={e.type} className="flex items-center gap-2 text-sm">
                        <span className="w-48 text-gray-700 truncate">
                          {EVENT_LABELS[e.type] ?? e.type}
                        </span>
                        <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                          <div
                            className="bg-blue-500 h-full"
                            style={{ width: `${(e.count / max) * 100}%` }}
                          />
                        </div>
                        <span className="w-12 text-right text-gray-500 tabular-nums">
                          {e.count}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Top flows */}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Топ воронок</h2>
              {data.topFlows.length === 0 ? (
                <div className="text-sm text-gray-400">Нет запусков за период</div>
              ) : (
                <div className="space-y-1.5">
                  {data.topFlows.map((f) => (
                    <Link
                      key={f.id}
                      href={`/admin/messaging/${botId}/flows/${f.id}`}
                      className="flex items-center justify-between text-sm hover:bg-gray-50 -mx-2 px-2 py-1 rounded transition-colors"
                    >
                      <span className="text-gray-700 truncate">{f.name}</span>
                      <span className="text-gray-500 tabular-nums">{f.starts}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Top triggers */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Топ триггеров (за всё время)</h2>
            {data.topTriggers.length === 0 ? (
              <div className="text-sm text-gray-400">Нет триггеров</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {data.topTriggers.map((t) => (
                  <div key={t.id} className="py-2 flex items-center gap-3 text-sm">
                    <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">
                      {t.type}
                    </span>
                    <Link
                      href={`/admin/messaging/${botId}/flows/${t.flow.id}`}
                      className="text-gray-700 hover:text-blue-600 truncate flex-1"
                    >
                      {t.flow.name}
                    </Link>
                    <span className="text-xs text-gray-500 truncate max-w-[200px]">
                      {t.keywords.slice(0, 3).join(", ")}
                      {t.keywords.length > 3 ? "…" : ""}
                    </span>
                    <span className="text-gray-500 tabular-nums">{t.triggerCount}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  sublabel,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  sublabel?: string;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-2xl font-bold text-gray-900 tabular-nums">{value.toLocaleString("ru-RU")}</div>
      {sublabel && <div className="text-xs text-gray-400 mt-0.5">{sublabel}</div>}
    </div>
  );
}
