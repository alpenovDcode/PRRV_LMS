"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Inbox as InboxIcon, MessageSquare, UserCheck, Clock } from "lucide-react";

interface InboxItem {
  id: string;
  chatId: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  tags: string[];
  lastSeenAt: string | null;
  operatorTakeoverAt?: string | null;
  lastInbound?: string;
  lastOutbound?: string | null;
}

interface InboxResp {
  active: InboxItem[];
  waiting: InboxItem[];
  recent: InboxItem[];
}

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "только что";
  if (min < 60) return `${min} мин назад`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} ч назад`;
  const d = Math.floor(h / 24);
  return `${d} д назад`;
}

export default function InboxPage() {
  const params = useParams<{ botId: string }>();
  const router = useRouter();
  const botId = params.botId;

  const inbox = useQuery({
    queryKey: ["tg-inbox", botId],
    queryFn: async () => {
      const r = await apiClient.get(`/admin/tg/bots/${botId}/inbox`);
      return r.data?.data as InboxResp;
    },
    refetchInterval: 15_000, // polling раз в 15 секунд
  });

  const openChat = (id: string) => {
    router.push(`/admin/bots/${botId}/subscribers/${id}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <InboxIcon className="h-5 w-5 text-purple-600" />
        <h1 className="text-xl font-semibold">Inbox оператора</h1>
        <span className="text-xs text-muted-foreground">
          обновляется каждые 15 сек
        </span>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-purple-600" />
            В ручном режиме ({inbox.data?.active.length ?? 0})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {!inbox.data?.active.length ? (
            <div className="text-sm text-muted-foreground italic">
              Пока никого не взяли в ручной режим
            </div>
          ) : (
            inbox.data.active.map((s) => (
              <InboxRow
                key={s.id}
                sub={s}
                rightMeta={
                  <span className="text-xs text-muted-foreground">
                    <Clock className="inline h-3 w-3" /> {timeAgo(s.operatorTakeoverAt)}
                  </span>
                }
                onClick={() => openChat(s.id)}
              />
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-amber-600" />
            Ждут ответа ({inbox.data?.waiting.length ?? 0})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {!inbox.data?.waiting.length ? (
            <div className="text-sm text-muted-foreground italic">
              Все ответили или ничего не ждёт
            </div>
          ) : (
            inbox.data.waiting.map((s) => (
              <InboxRow
                key={s.id}
                sub={s}
                rightMeta={
                  <span className="text-xs text-amber-700 font-medium">
                    <Clock className="inline h-3 w-3" /> {timeAgo(s.lastInbound)}
                  </span>
                }
                onClick={() => openChat(s.id)}
              />
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            Недавно активны ({inbox.data?.recent.length ?? 0})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {!inbox.data?.recent.length ? (
            <div className="text-sm text-muted-foreground italic">пусто</div>
          ) : (
            inbox.data.recent.map((s) => (
              <InboxRow
                key={s.id}
                sub={s}
                rightMeta={
                  <span className="text-xs text-muted-foreground">
                    {timeAgo(s.lastSeenAt)}
                  </span>
                }
                onClick={() => openChat(s.id)}
              />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function InboxRow({
  sub,
  rightMeta,
  onClick,
}: {
  sub: InboxItem;
  rightMeta: React.ReactNode;
  onClick: () => void;
}) {
  const name = [sub.firstName, sub.lastName].filter(Boolean).join(" ") || sub.chatId;
  return (
    <Button
      variant="ghost"
      className="w-full justify-between gap-3 h-auto py-2"
      onClick={onClick}
    >
      <div className="flex-1 min-w-0 text-left">
        <div className="text-sm font-medium truncate">
          {name}
          {sub.username && (
            <span className="ml-2 text-muted-foreground">@{sub.username}</span>
          )}
        </div>
        {sub.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {sub.tags.slice(0, 4).map((t) => (
              <Badge key={t} variant="secondary" className="text-[10px]">
                {t}
              </Badge>
            ))}
          </div>
        )}
      </div>
      {rightMeta}
    </Button>
  );
}
