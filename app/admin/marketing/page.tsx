"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Users,
  Send,
  FileText,
  Filter,
  Workflow,
  Mail,
  Eye,
  MousePointer,
  UserX,
  AlertOctagon,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

interface OverviewData {
  totalContacts: number;
  subscribedContacts: number;
  totalCampaigns: number;
  totalSegments: number;
  totalTemplates: number;
  totalAutomations: number;
}

interface DeliverabilityData {
  period: { days: number; since: string; until: string };
  totals: {
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    bounced: number;
    spam: number;
    unsubscribed: number;
  };
  uniques: { opened: number; clicked: number };
  rates: {
    openRate: number;
    clickRate: number;
    bounceRate: number;
    unsubRate: number;
    spamRate: number;
  };
  weekly: Array<{ weekStart: string; sent: number; opened: number; clicked: number }>;
  topCampaigns: Array<{
    id: string;
    name: string;
    subject: string;
    finishedAt: string | null;
    sent: number;
    opened: number;
    clicked: number;
    openRate: number;
    clickRate: number;
  }>;
}

function pct(value: number): string {
  return (value * 100).toFixed(1) + "%";
}

export default function MarketingDashboardPage() {
  const [days, setDays] = useState(30);

  const { data: overview, isLoading: ovLoading } = useQuery<OverviewData>({
    queryKey: ["marketing-overview"],
    queryFn: async () => {
      const r = await apiClient.get("/admin/marketing/stats/overview");
      return r.data.data;
    },
  });

  const { data: deliverability, isLoading: delLoading } = useQuery<DeliverabilityData>({
    queryKey: ["marketing-deliverability", days],
    queryFn: async () => {
      const r = await apiClient.get(`/admin/marketing/stats/deliverability?days=${days}`);
      return r.data.data;
    },
  });

  const totals = deliverability?.totals;
  const rates = deliverability?.rates;

  return (
    <div className="container mx-auto max-w-7xl px-4 py-8 space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-lg bg-blue-100 flex items-center justify-center">
          <Mail className="h-6 w-6 text-blue-600" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Маркетинг</h1>
          <p className="text-gray-600">
            Метрики email-кампаний и состояние модулей. Подключается к Unisender одним переключением{" "}
            <code className="rounded bg-gray-100 px-1 text-sm">EMAIL_MARKETING_PROVIDER</code>.
          </p>
        </div>
      </div>

      {/* Модули */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <ModuleCard
          label="Контакты"
          value={
            overview
              ? `${overview.subscribedContacts.toLocaleString("ru-RU")} / ${overview.totalContacts.toLocaleString("ru-RU")}`
              : "—"
          }
          hint="подписанных / всего"
          href="/admin/marketing/contacts"
          icon={Users}
          color="bg-blue-50 text-blue-600"
          isLoading={ovLoading}
        />
        <ModuleCard
          label="Кампании"
          value={overview ? overview.totalCampaigns.toLocaleString("ru-RU") : "—"}
          hint="всего создано"
          href="/admin/marketing/campaigns"
          icon={Send}
          color="bg-emerald-50 text-emerald-600"
          isLoading={ovLoading}
        />
        <ModuleCard
          label="Сегменты"
          value={overview ? overview.totalSegments.toLocaleString("ru-RU") : "—"}
          hint="сохранено"
          href="/admin/marketing/segments"
          icon={Filter}
          color="bg-purple-50 text-purple-600"
          isLoading={ovLoading}
        />
        <ModuleCard
          label="Шаблоны"
          value={overview ? overview.totalTemplates.toLocaleString("ru-RU") : "—"}
          hint="в библиотеке"
          href="/admin/marketing/templates"
          icon={FileText}
          color="bg-amber-50 text-amber-600"
          isLoading={ovLoading}
        />
        <ModuleCard
          label="Автоматизации"
          value={overview ? overview.totalAutomations.toLocaleString("ru-RU") : "—"}
          hint="активных цепочек"
          href="/admin/marketing/automations"
          icon={Workflow}
          color="bg-pink-50 text-pink-600"
          isLoading={ovLoading}
        />
      </div>

      {/* Метрики за период */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-emerald-600" />
                Метрики доставляемости
              </CardTitle>
              <CardDescription>
                Уникальные открытия и клики по EmailEvent. Bounce и spam — с webhook провайдера.
              </CardDescription>
            </div>
            <div className="flex gap-1">
              {[7, 30, 90].map((d) => (
                <Button
                  key={d}
                  variant={days === d ? "default" : "outline"}
                  size="sm"
                  onClick={() => setDays(d)}
                >
                  {d} дней
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            <Metric label="Отправлено" value={totals?.sent ?? 0} icon={Send} loading={delLoading} />
            <Metric
              label="Доставлено"
              value={totals?.delivered ?? 0}
              icon={Mail}
              loading={delLoading}
            />
            <Metric
              label="Открыто (uniq)"
              value={deliverability?.uniques.opened ?? 0}
              icon={Eye}
              color="text-emerald-600"
              loading={delLoading}
            />
            <Metric
              label="Кликов (uniq)"
              value={deliverability?.uniques.clicked ?? 0}
              icon={MousePointer}
              color="text-purple-600"
              loading={delLoading}
            />
            <Metric
              label="Отписалось"
              value={totals?.unsubscribed ?? 0}
              icon={UserX}
              color="text-rose-600"
              loading={delLoading}
            />
            <Metric
              label="Bounced"
              value={totals?.bounced ?? 0}
              icon={AlertOctagon}
              color="text-amber-600"
              loading={delLoading}
            />
            <Metric
              label="Жалоб"
              value={totals?.spam ?? 0}
              icon={AlertOctagon}
              color="text-red-600"
              loading={delLoading}
            />
          </div>

          {rates && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 pt-3 border-t">
              <RateRow label="OR" value={pct(rates.openRate)} hint="opened / sent" />
              <RateRow label="CTR" value={pct(rates.clickRate)} hint="clicked / sent" />
              <RateRow
                label="Bounce rate"
                value={pct(rates.bounceRate)}
                hint="отказы"
                warn={rates.bounceRate > 0.02}
              />
              <RateRow
                label="Unsub rate"
                value={pct(rates.unsubRate)}
                hint="отписки"
                warn={rates.unsubRate > 0.005}
              />
              <RateRow
                label="Spam rate"
                value={pct(rates.spamRate)}
                hint="жалобы (критично < 0.1%)"
                warn={rates.spamRate > 0.001}
              />
            </div>
          )}

          {deliverability && deliverability.weekly.length > 0 && (
            <div className="pt-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">По неделям</h3>
              <div style={{ width: "100%", height: 240 }}>
                <ResponsiveContainer>
                  <LineChart data={deliverability.weekly}>
                    <CartesianGrid stroke="#f3f4f6" strokeDasharray="3 3" />
                    <XAxis dataKey="weekStart" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                    <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" />
                    <Tooltip />
                    <Line type="monotone" dataKey="sent" stroke="#9ca3af" strokeWidth={2} />
                    <Line type="monotone" dataKey="opened" stroke="#10b981" strokeWidth={2} />
                    <Line type="monotone" dataKey="clicked" stroke="#8b5cf6" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="flex gap-4 text-xs text-gray-600 justify-center mt-2">
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded bg-gray-400" /> отправлено
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded bg-emerald-500" /> открыто
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded bg-purple-500" /> кликов
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {deliverability && deliverability.topCampaigns.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Топ-5 кампаний по OR за период</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-gray-100">
              {deliverability.topCampaigns.map((c) => (
                <Link
                  key={c.id}
                  href={`/admin/marketing/campaigns/${c.id}`}
                  className="block px-4 py-3 hover:bg-emerald-50/30"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-gray-900 truncate">{c.name}</div>
                      <div className="text-xs text-gray-500 truncate">{c.subject}</div>
                    </div>
                    <div className="flex gap-4 text-sm tabular-nums">
                      <div className="text-right">
                        <div className="text-xs text-gray-500">Sent</div>
                        <div className="font-medium">{c.sent.toLocaleString("ru-RU")}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-gray-500">OR</div>
                        <div className="font-semibold text-emerald-600">{pct(c.openRate)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-gray-500">CTR</div>
                        <div className="font-semibold text-purple-600">{pct(c.clickRate)}</div>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ModuleCard({
  label,
  value,
  hint,
  href,
  icon: Icon,
  color,
  isLoading,
}: {
  label: string;
  value: string;
  hint: string;
  href: string;
  icon: typeof Mail;
  color: string;
  isLoading?: boolean;
}) {
  return (
    <Link href={href}>
      <Card className="cursor-pointer hover:shadow-md transition-shadow h-full">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-gray-700">{label}</CardTitle>
          <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${color}`}>
            <Icon className="h-4 w-4" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-gray-900">{isLoading ? "…" : value}</div>
          <p className="text-xs text-gray-500 mt-1">{hint}</p>
        </CardContent>
      </Card>
    </Link>
  );
}

function Metric({
  label,
  value,
  color = "text-gray-900",
  icon: Icon,
  loading,
}: {
  label: string;
  value: number;
  color?: string;
  icon?: typeof Mail;
  loading?: boolean;
}) {
  return (
    <div className="p-3 rounded-lg border border-gray-100 bg-white">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-600">{label}</span>
        {Icon && <Icon className="h-3 w-3 text-gray-400" />}
      </div>
      <div className={`text-2xl font-bold ${color}`}>
        {loading ? "…" : value.toLocaleString("ru-RU")}
      </div>
    </div>
  );
}

function RateRow({
  label,
  value,
  hint,
  warn,
}: {
  label: string;
  value: string;
  hint: string;
  warn?: boolean;
}) {
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-xl font-bold tabular-nums ${warn ? "text-amber-600" : "text-gray-900"}`}>
        {value}
      </div>
      <div className="text-xs text-gray-400">{hint}</div>
    </div>
  );
}
