"use client";

import { use } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  ArrowLeft,
  Send,
  Pause,
  Play,
  X,
  Mail,
  Eye,
  MousePointer,
  AlertOctagon,
  UserX,
  CheckCircle2,
  Clock,
  XCircle,
} from "lucide-react";

interface DeliveryJob {
  id: string;
  email: string;
  status: string;
  attemptCount: number;
  nextAttemptAt: string;
  lastError: string | null;
  sentAt: string | null;
  providerMessageId: string | null;
  user: { id: string; fullName: string | null } | null;
}

interface CampaignDetail {
  id: string;
  name: string;
  subject: string;
  preheader: string | null;
  fromName: string;
  fromEmail: string;
  status: string;
  scheduledAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  stats: Record<string, number> | null;
  segment: { id: string; name: string; contactCount: number } | null;
  template: { id: string; name: string; subject: string } | null;
  deliveryJobs: DeliveryJob[];
  createdAt: string;
  updatedAt: string;
}

const STATUS_META: Record<string, { label: string; color: string; icon: typeof Mail }> = {
  draft: { label: "Черновик", color: "bg-gray-100 text-gray-700", icon: Mail },
  scheduled: { label: "Запланирована", color: "bg-blue-100 text-blue-700", icon: Clock },
  sending: { label: "Отправляется", color: "bg-amber-100 text-amber-700", icon: Send },
  paused: { label: "На паузе", color: "bg-orange-100 text-orange-700", icon: Pause },
  sent: { label: "Отправлена", color: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  failed: { label: "Ошибка", color: "bg-red-100 text-red-700", icon: XCircle },
  cancelled: { label: "Отменена", color: "bg-gray-200 text-gray-600", icon: X },
};

const JOB_STATUS_META: Record<string, { label: string; color: string }> = {
  pending: { label: "В очереди", color: "bg-gray-100 text-gray-700" },
  retrying: { label: "Повтор", color: "bg-amber-100 text-amber-700" },
  sent: { label: "Отправлено", color: "bg-emerald-100 text-emerald-700" },
  failed: { label: "Ошибка", color: "bg-red-100 text-red-700" },
  cancelled: { label: "Отменено", color: "bg-gray-200 text-gray-600" },
};

function fmt(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function MarketingCampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["marketing-campaign", id],
    queryFn: async () => {
      const r = await apiClient.get(`/admin/marketing/campaigns/${id}`);
      return r.data.data as CampaignDetail;
    },
    refetchInterval: (q) => {
      const status = q.state.data?.status;
      return status === "sending" || status === "scheduled" ? 3000 : false;
    },
  });

  const actionMutation = useMutation({
    mutationFn: async (action: "pause" | "resume" | "cancel") => {
      const r = await apiClient.post(`/admin/marketing/campaigns/${id}/${action}`);
      return r.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing-campaign", id] });
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Не удалось";
      toast.error(msg);
    },
  });

  if (isLoading) {
    return <div className="container mx-auto max-w-6xl px-4 py-8 text-gray-500">Загрузка…</div>;
  }

  if (!data) {
    return (
      <div className="container mx-auto max-w-6xl px-4 py-8">
        <Link href="/admin/marketing/campaigns" className="text-sm text-gray-600 hover:text-gray-900">
          ← К списку
        </Link>
        <Card className="mt-4">
          <CardContent className="py-12 text-center text-gray-500">Кампания не найдена</CardContent>
        </Card>
      </div>
    );
  }

  const stats = data.stats ?? {};
  const recipients = stats.recipients ?? data.segment?.contactCount ?? 0;
  const sent = stats.sent ?? 0;
  const failed = stats.failed ?? 0;
  const pending = stats.pending ?? 0;
  const opened = stats.opened ?? 0;
  const clicked = stats.clicked ?? 0;
  const unsubscribed = stats.unsubscribed ?? 0;
  const bounced = stats.bounced ?? 0;

  const processed = sent + failed;
  const progress = recipients > 0 ? Math.round((processed / recipients) * 100) : 0;

  const meta = STATUS_META[data.status] ?? STATUS_META.draft;
  const StatusIcon = meta.icon;

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8 space-y-6">
      <Link
        href="/admin/marketing/campaigns"
        className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />К списку
      </Link>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className={`h-12 w-12 rounded-lg flex items-center justify-center ${meta.color}`}>
            <StatusIcon className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">{data.name}</h1>
            <div className="flex items-center gap-2 flex-wrap mt-1">
              <Badge className={meta.color}>{meta.label}</Badge>
              {data.scheduledAt && data.status === "scheduled" && (
                <span className="text-sm text-gray-600">Запуск: {fmt(data.scheduledAt)}</span>
              )}
              {data.startedAt && (
                <span className="text-sm text-gray-600">Старт: {fmt(data.startedAt)}</span>
              )}
              {data.finishedAt && (
                <span className="text-sm text-gray-600">Завершено: {fmt(data.finishedAt)}</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          {data.status === "sending" && (
            <Button
              variant="outline"
              onClick={() => actionMutation.mutate("pause")}
              disabled={actionMutation.isPending}
              className="gap-2"
            >
              <Pause className="h-4 w-4" />
              Пауза
            </Button>
          )}
          {data.status === "paused" && (
            <Button
              onClick={() => actionMutation.mutate("resume")}
              disabled={actionMutation.isPending}
              className="gap-2"
            >
              <Play className="h-4 w-4" />
              Возобновить
            </Button>
          )}
          {(data.status === "sending" || data.status === "paused" || data.status === "scheduled") && (
            <Button
              variant="outline"
              onClick={() => {
                if (window.confirm("Отменить отправку? Оставшиеся письма не будут отправлены.")) {
                  actionMutation.mutate("cancel");
                }
              }}
              disabled={actionMutation.isPending}
              className="gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              <X className="h-4 w-4" />
              Отменить
            </Button>
          )}
        </div>
      </div>

      {(data.status === "sending" || data.status === "paused") && recipients > 0 && (
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-700">
                Обработано: <strong>{processed.toLocaleString("ru-RU")}</strong> из{" "}
                <strong>{recipients.toLocaleString("ru-RU")}</strong>
                {pending > 0 && (
                  <span className="text-gray-500"> · в очереди {pending.toLocaleString("ru-RU")}</span>
                )}
              </span>
              <span className="font-semibold tabular-nums">{progress}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <MetricCard label="Получателей" value={recipients} />
        <MetricCard label="Отправлено" value={sent} color="text-emerald-600" icon={Send} />
        <MetricCard label="Доставлено" value={stats.delivered ?? 0} icon={Mail} />
        <MetricCard label="Открыто" value={opened} icon={Eye} />
        <MetricCard label="Кликов" value={clicked} icon={MousePointer} />
        <MetricCard label="Отписалось" value={unsubscribed} color="text-rose-600" icon={UserX} />
        <MetricCard
          label="Bounce / Ошибки"
          value={failed + bounced}
          color="text-red-600"
          icon={AlertOctagon}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Параметры кампании</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <Field label="Сегмент" value={data.segment?.name ?? "—"} />
          <Field label="Шаблон" value={data.template?.name ?? "—"} />
          <Field label="Тема" value={data.subject} />
          <Field label="Прехедер" value={data.preheader ?? "—"} />
          <Field label="От (имя)" value={data.fromName} />
          <Field label="От (email)" value={data.fromEmail} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Последние 50 получателей</CardTitle>
          <CardDescription>
            Сортировка по последнему обновлению. Свежие наверху. Подробная история кликов и
            открытий — в Спринте 5.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {data.deliveryJobs.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-500">
              Получатели появятся после старта кампании.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3 text-left">Email</th>
                    <th className="px-4 py-3 text-left">Статус</th>
                    <th className="px-4 py-3 text-left">Попытки</th>
                    <th className="px-4 py-3 text-left">Время</th>
                    <th className="px-4 py-3 text-left">Ошибка</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.deliveryJobs.map((j) => {
                    const jm = JOB_STATUS_META[j.status] ?? JOB_STATUS_META.pending;
                    return (
                      <tr key={j.id}>
                        <td className="px-4 py-3">
                          {j.user ? (
                            <Link
                              href={`/admin/marketing/contacts/${j.user.id}`}
                              className="text-gray-900 hover:text-emerald-600"
                            >
                              {j.email}
                            </Link>
                          ) : (
                            <span className="text-gray-900">{j.email}</span>
                          )}
                          {j.user?.fullName && (
                            <div className="text-xs text-gray-500">{j.user.fullName}</div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <Badge className={jm.color}>{jm.label}</Badge>
                        </td>
                        <td className="px-4 py-3 text-gray-700 tabular-nums">{j.attemptCount}</td>
                        <td className="px-4 py-3 text-xs text-gray-500">
                          {j.sentAt ? fmt(j.sentAt) : `след. попытка: ${fmt(j.nextAttemptAt)}`}
                        </td>
                        <td className="px-4 py-3 text-xs text-red-600 max-w-xs truncate">
                          {j.lastError ?? ""}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({
  label,
  value,
  color = "text-gray-900",
  icon: Icon,
}: {
  label: string;
  value: number;
  color?: string;
  icon?: typeof Mail;
}) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-gray-600">{label}</span>
          {Icon && <Icon className="h-3 w-3 text-gray-400" />}
        </div>
        <div className={`text-2xl font-bold ${color}`}>{value.toLocaleString("ru-RU")}</div>
      </CardContent>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="font-medium text-gray-900 truncate">{value}</div>
    </div>
  );
}
