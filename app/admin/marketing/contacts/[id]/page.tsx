"use client";

import { use } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  ArrowLeft,
  Mail,
  Send,
  Eye,
  MousePointer,
  AlertOctagon,
  UserX,
  RefreshCw,
  ShieldCheck,
  ExternalLink,
} from "lucide-react";

interface EmailEvent {
  id: string;
  type: string;
  url: string | null;
  campaignId: string | null;
  occurredAt: string;
  campaign: { id: string; name: string; subject: string } | null;
}

interface BroadcastRecipientRow {
  id: string;
  email: string | null;
  emailStatus: string | null;
  lmsStatus: string | null;
  deliveredAt: string | null;
  openedAt: string | null;
  openCount: number;
  clickedAt: string | null;
  clickCount: number;
  bouncedAt: string | null;
  unsubscribedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
  broadcast: { id: string; title: string } | null;
}

interface ContactDetail {
  user: {
    id: string;
    email: string;
    fullName: string | null;
    role: string;
    tariff: string | null;
    track: string | null;
    createdAt: string;
    lastActiveAt: string | null;
    isBlocked: boolean;
    externalContactId: string | null;
    contactSyncedAt: string | null;
    emailValidated: boolean;
    marketingOptOut: boolean;
    unsubscribedAt: string | null;
    emailTags: string[] | null;
  };
  stats: { sent: number; opened: number; clicked: number; bounced: number };
  events: EmailEvent[];
  broadcastRecipients: BroadcastRecipientRow[];
}

const EVENT_META: Record<string, { label: string; color: string; icon: typeof Mail }> = {
  sent: { label: "Отправлено", color: "bg-gray-100 text-gray-700", icon: Send },
  delivered: { label: "Доставлено", color: "bg-blue-50 text-blue-700", icon: Mail },
  opened: { label: "Открыто", color: "bg-emerald-50 text-emerald-700", icon: Eye },
  clicked: { label: "Клик", color: "bg-purple-50 text-purple-700", icon: MousePointer },
  bounced: { label: "Bounce", color: "bg-amber-50 text-amber-700", icon: AlertOctagon },
  spam: { label: "Жалоба", color: "bg-red-50 text-red-700", icon: AlertOctagon },
  unsubscribed: { label: "Отписка", color: "bg-rose-50 text-rose-700", icon: UserX },
};

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function MarketingContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["marketing-contact", id],
    queryFn: async () => {
      const r = await apiClient.get(`/admin/marketing/contacts/${id}`);
      return r.data.data as ContactDetail;
    },
  });

  const unsubscribeMutation = useMutation({
    mutationFn: async (vars: { subscribe: boolean }) => {
      const r = await apiClient.post(
        `/admin/marketing/contacts/${id}/unsubscribe`,
        { subscribe: vars.subscribe }
      );
      return r.data.data;
    },
    onSuccess: (_, vars) => {
      toast.success(vars.subscribe ? "Подписка восстановлена" : "Контакт отписан");
      queryClient.invalidateQueries({ queryKey: ["marketing-contact", id] });
    },
    onError: () => toast.error("Не удалось изменить подписку"),
  });

  if (isLoading) {
    return (
      <div className="container mx-auto max-w-5xl px-4 py-8 text-gray-500">Загрузка…</div>
    );
  }

  if (!data) {
    return (
      <div className="container mx-auto max-w-5xl px-4 py-8">
        <Link href="/admin/marketing/contacts" className="text-sm text-gray-600 hover:text-gray-900">
          ← К списку контактов
        </Link>
        <Card className="mt-4">
          <CardContent className="py-12 text-center text-gray-500">
            Контакт не найден
          </CardContent>
        </Card>
      </div>
    );
  }

  const { user, stats, events, broadcastRecipients } = data;

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8 space-y-6">
      <Link
        href="/admin/marketing/contacts"
        className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />К списку контактов
      </Link>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-lg bg-blue-100 flex items-center justify-center">
            <Mail className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">{user.email}</h1>
            <div className="text-gray-600 flex items-center gap-2 flex-wrap mt-1">
              {user.fullName && <span>{user.fullName}</span>}
              <span className="text-gray-400">·</span>
              <span>Зарегистрирован {fmtDateTime(user.createdAt)}</span>
              {user.lastActiveAt && (
                <>
                  <span className="text-gray-400">·</span>
                  <span>Был активен {fmtDateTime(user.lastActiveAt)}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href={`/admin/users/${user.id}`}>
            <Button variant="outline" className="gap-2">
              <ExternalLink className="h-4 w-4" />
              Открыть в LMS-карточке
            </Button>
          </Link>
          <Button
            variant={user.marketingOptOut ? "default" : "outline"}
            onClick={() => unsubscribeMutation.mutate({ subscribe: user.marketingOptOut })}
            disabled={unsubscribeMutation.isPending}
            className="gap-2"
          >
            {user.marketingOptOut ? (
              <>
                <RefreshCw className="h-4 w-4" />
                Подписать
              </>
            ) : (
              <>
                <UserX className="h-4 w-4" />
                Отписать
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Отправлено</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.sent.toLocaleString("ru-RU")}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Открыто</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.opened.toLocaleString("ru-RU")}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Кликов</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.clicked.toLocaleString("ru-RU")}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Bounce</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.bounced.toLocaleString("ru-RU")}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Статус</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {user.marketingOptOut ? (
              <Badge className="bg-red-50 text-red-700 hover:bg-red-50">
                Отписан{user.unsubscribedAt ? ` ${fmtDateTime(user.unsubscribedAt)}` : ""}
              </Badge>
            ) : (
              <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
                Подписан на маркетинг
              </Badge>
            )}
            {user.emailValidated && (
              <Badge className="bg-blue-50 text-blue-700 hover:bg-blue-50">
                <ShieldCheck className="h-3 w-3 mr-1" />
                Email валидирован
              </Badge>
            )}
            {user.externalContactId && (
              <Badge variant="outline">
                Unisender ID: {user.externalContactId}
              </Badge>
            )}
            {user.isBlocked && (
              <Badge variant="secondary" className="bg-gray-100 text-gray-700">
                Заблокирован в LMS
              </Badge>
            )}
          </div>
          {user.contactSyncedAt && (
            <p className="text-xs text-gray-500">
              Последняя синхронизация с провайдером: {fmtDateTime(user.contactSyncedAt)}
            </p>
          )}
          {(user.emailTags ?? []).length > 0 && (
            <div className="flex flex-wrap gap-1 pt-2 border-t">
              {(user.emailTags ?? []).map((tag) => (
                <Badge key={tag} variant="outline" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>История email-событий</CardTitle>
          <CardDescription>
            Открытия и клики появятся после Спринта 5 (tracking-пиксель + click-redirect).
            Сейчас показываются только записи из БД.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {events.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-500">Событий пока нет</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {events.map((evt) => {
                const meta = EVENT_META[evt.type] ?? {
                  label: evt.type,
                  color: "bg-gray-100 text-gray-700",
                  icon: Mail,
                };
                const Icon = meta.icon;
                return (
                  <div key={evt.id} className="flex items-center gap-3 px-4 py-3">
                    <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${meta.color}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{meta.label}</span>
                        {evt.campaign && (
                          <Link
                            href={`/admin/marketing/campaigns/${evt.campaign.id}`}
                            className="text-xs text-blue-600 hover:underline truncate"
                          >
                            {evt.campaign.name}
                          </Link>
                        )}
                      </div>
                      {evt.url && (
                        <div className="text-xs text-gray-500 truncate">{evt.url}</div>
                      )}
                    </div>
                    <span className="text-xs text-gray-400 whitespace-nowrap">
                      {fmtDateTime(evt.occurredAt)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {broadcastRecipients.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>LMS-рассылки</CardTitle>
            <CardDescription>
              Уведомления из существующего модуля /admin/broadcasts. Будет объединено с маркетингом
              в Спринте 7.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-gray-100">
              {broadcastRecipients.map((br) => (
                <div key={br.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">
                      {br.broadcast?.title ?? "—"}
                    </div>
                    <div className="text-xs text-gray-500 flex gap-2 mt-1 flex-wrap">
                      {br.emailStatus && (
                        <span>
                          Email: <strong>{br.emailStatus}</strong>
                        </span>
                      )}
                      {br.lmsStatus && (
                        <span>
                          LMS: <strong>{br.lmsStatus}</strong>
                        </span>
                      )}
                      {br.openCount > 0 && <span>Открытий: {br.openCount}</span>}
                      {br.clickCount > 0 && <span>Кликов: {br.clickCount}</span>}
                    </div>
                    {br.errorMessage && (
                      <div className="text-xs text-red-600 mt-1 truncate">{br.errorMessage}</div>
                    )}
                  </div>
                  <span className="text-xs text-gray-400 whitespace-nowrap">
                    {fmtDateTime(br.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
