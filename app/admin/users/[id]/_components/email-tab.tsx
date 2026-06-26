"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
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

/**
 * Вкладка «Email» в карточке пользователя /admin/users/[id].
 *
 * Переиспользует API /admin/marketing/contacts/[id] — ту же ручку,
 * что и страница /admin/marketing/contacts/[id], только в компактном виде.
 * Идея: когда админ открывает карточку обычного пользователя, ему сразу видна
 * история взаимодействия с email — без необходимости прыгать в маркетинг-раздел.
 */

interface EmailTabProps {
  userId: string;
}

interface EmailEvent {
  id: string;
  type: string;
  url: string | null;
  campaignId: string | null;
  occurredAt: string;
  campaign: { id: string; name: string; subject: string } | null;
}

interface ContactDetail {
  user: {
    id: string;
    email: string;
    externalContactId: string | null;
    contactSyncedAt: string | null;
    emailValidated: boolean;
    marketingOptOut: boolean;
    unsubscribedAt: string | null;
    emailTags: string[] | null;
  };
  stats: { sent: number; opened: number; clicked: number; bounced: number };
  events: EmailEvent[];
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

export function EmailTab({ userId }: EmailTabProps) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["user-email-tab", userId],
    queryFn: async () => {
      const r = await apiClient.get(`/admin/marketing/contacts/${userId}`);
      return r.data.data as ContactDetail;
    },
  });

  const subMutation = useMutation({
    mutationFn: async (vars: { subscribe: boolean }) => {
      const r = await apiClient.post(
        `/admin/marketing/contacts/${userId}/unsubscribe`,
        { subscribe: vars.subscribe }
      );
      return r.data.data;
    },
    onSuccess: (_, vars) => {
      toast.success(vars.subscribe ? "Подписка восстановлена" : "Контакт отписан");
      queryClient.invalidateQueries({ queryKey: ["user-email-tab", userId] });
    },
    onError: () => toast.error("Не удалось изменить подписку"),
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-gray-500">
          Данные не загружены
        </CardContent>
      </Card>
    );
  }

  const { user, stats, events } = data;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-blue-600" />
                Email маркетинг
              </CardTitle>
              <CardDescription className="mt-1">
                Статус подписки, теги и история взаимодействия с маркетинговыми письмами.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Link href={`/admin/marketing/contacts/${userId}`}>
                <Button variant="outline" size="sm" className="gap-2">
                  <ExternalLink className="h-4 w-4" />В карточку контакта
                </Button>
              </Link>
              <Button
                variant={user.marketingOptOut ? "default" : "outline"}
                size="sm"
                onClick={() => subMutation.mutate({ subscribe: user.marketingOptOut })}
                disabled={subMutation.isPending}
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
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {user.marketingOptOut ? (
              <Badge className="bg-red-50 text-red-700 hover:bg-red-50">
                Отписан{user.unsubscribedAt ? ` ${fmt(user.unsubscribedAt)}` : ""}
              </Badge>
            ) : (
              <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
                Подписан на маркетинг
              </Badge>
            )}
            {user.emailValidated && (
              <Badge className="bg-blue-50 text-blue-700 hover:bg-blue-50">
                <ShieldCheck className="h-3 w-3 mr-1" />
                Валидирован
              </Badge>
            )}
            {user.externalContactId && (
              <Badge variant="outline">Unisender ID: {user.externalContactId}</Badge>
            )}
          </div>

          {user.contactSyncedAt && (
            <p className="text-xs text-gray-500">
              Последняя синхронизация с провайдером: {fmt(user.contactSyncedAt)}
            </p>
          )}

          {(user.emailTags ?? []).length > 0 && (
            <div className="flex flex-wrap gap-1 pt-3 border-t">
              <span className="text-xs text-gray-500 mr-1">Теги:</span>
              {(user.emailTags ?? []).map((tag) => (
                <Badge key={tag} variant="outline" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          )}

          <div className="grid grid-cols-4 gap-3 pt-3 border-t">
            <Stat label="Отправлено" value={stats.sent} />
            <Stat label="Открыто" value={stats.opened} />
            <Stat label="Кликов" value={stats.clicked} />
            <Stat label="Bounce" value={stats.bounced} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>История событий</CardTitle>
          <CardDescription>
            Последние 100 событий из EmailEvent. Tracking-пиксель и click-redirect
            начнут поставлять данные в Спринте 5.
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
                    <div
                      className={`h-8 w-8 rounded-lg flex items-center justify-center ${meta.color}`}
                    >
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
                      {fmt(evt.occurredAt)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-xl font-semibold text-gray-900">{value.toLocaleString("ru-RU")}</div>
    </div>
  );
}
