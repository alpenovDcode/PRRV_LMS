"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { SubscriberDrawer } from "@/components/admin/tg/subscriber-drawer";

interface Subscriber {
  id: string;
  chatId: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  tags: string[];
  isBlocked: boolean;
  lastSeenAt: string | null;
  subscribedAt: string;
  firstTouchSlug: string | null;
}

export default function SubscribersPage() {
  const params = useParams<{ botId: string }>();
  const botId = params.botId;
  const [q, setQ] = useState("");
  const [tag, setTag] = useState("");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["tg-subs", botId, q, tag, page],
    queryFn: async () => {
      const r = await apiClient.get(`/admin/tg/bots/${botId}/subscribers`, {
        params: { q, tag: tag || undefined, page, pageSize: 50 },
      });
      return r.data?.data as { items: Subscriber[]; total: number; page: number; pageSize: number };
    },
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Фильтры</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Поиск по имени или chat_id"
              className="pl-9"
              value={q}
              onChange={(e) => {
                setPage(1);
                setQ(e.target.value);
              }}
            />
          </div>
          <Input
            placeholder="Тег"
            className="w-40"
            value={tag}
            onChange={(e) => {
              setPage(1);
              setTag(e.target.value);
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Загрузка...</div>
          ) : !data?.items.length ? (
            <div className="p-8 text-center text-muted-foreground">пусто</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
                  <th className="text-left p-3">Пользователь</th>
                  <th className="text-left p-3">@username</th>
                  <th className="text-left p-3">Теги</th>
                  <th className="text-left p-3">Источник</th>
                  <th className="text-left p-3">Подписан</th>
                  <th className="text-left p-3">Статус</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((s) => (
                  <tr
                    key={s.id}
                    className="border-b hover:bg-muted/30 cursor-pointer"
                    onClick={() => setOpenId(s.id)}
                  >
                    <td className="p-3">
                      {[s.firstName, s.lastName].filter(Boolean).join(" ") || s.chatId}
                    </td>
                    <td className="p-3">{s.username ? "@" + s.username : "—"}</td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        {s.tags.slice(0, 4).map((t) => (
                          <Badge key={t} variant="secondary" className="text-xs">
                            {t}
                          </Badge>
                        ))}
                        {s.tags.length > 4 && (
                          <span className="text-xs text-muted-foreground">+{s.tags.length - 4}</span>
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {s.firstTouchSlug ?? "—"}
                    </td>
                    <td className="p-3 text-xs">
                      {new Date(s.subscribedAt).toLocaleDateString("ru-RU")}
                    </td>
                    <td className="p-3">
                      {s.isBlocked ? (
                        <Badge variant="destructive">blocked</Badge>
                      ) : (
                        <Badge>active</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {data && data.total > data.pageSize && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span>
            стр. {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {openId && (
        <SubscriberDrawer
          botId={botId}
          subscriberId={openId}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}
