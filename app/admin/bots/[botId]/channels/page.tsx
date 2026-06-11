"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Copy, Plus, RefreshCw, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";

interface Channel {
  id: string;
  chatId: string;
  title: string;
  username: string | null;
  type: string;
  isActive: boolean;
  baselineCount: number;
  baselineAt: string | null;
  membersNow: number;
  trackedTotal: number;
}

interface InviteLink {
  id: string;
  name: string;
  inviteUrl: string;
  utm: Record<string, string>;
  joinCount: number;
  memberLimit: number | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export default function ChannelsPage() {
  const params = useParams<{ botId: string }>();
  const botId = params.botId;
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [addValue, setAddValue] = useState("");

  const { data: channels, isLoading } = useQuery({
    queryKey: ["tg-channels", botId],
    queryFn: async () => {
      const r = await apiClient.get(`/admin/tg/bots/${botId}/channels`);
      return (r.data?.data ?? []) as Channel[];
    },
  });

  const addMutation = useMutation({
    mutationFn: async (value: string) => {
      const isChatId = /^-?\d+$/.test(value.trim());
      const body = isChatId
        ? { chatId: value.trim() }
        : { username: value.trim().replace(/^@/, "") };
      const r = await apiClient.post(`/admin/tg/bots/${botId}/channels`, body);
      return r.data;
    },
    onSuccess: () => {
      toast.success("Канал подключён");
      setAddOpen(false);
      setAddValue("");
      queryClient.invalidateQueries({ queryKey: ["tg-channels", botId] });
    },
    onError: (e: unknown) => {
      const msg =
        (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? "Не удалось подключить канал";
      toast.error(msg);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async (args: { id: string; isActive: boolean }) => {
      await apiClient.patch(`/admin/tg/bots/${botId}/channels/${args.id}`, {
        isActive: args.isActive,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tg-channels", botId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/admin/tg/bots/${botId}/channels/${id}`);
    },
    onSuccess: () => {
      toast.success("Канал отключён");
      queryClient.invalidateQueries({ queryKey: ["tg-channels", botId] });
    },
  });

  const refreshBaselineMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.post(`/admin/tg/bots/${botId}/channels/${id}/baseline`);
    },
    onSuccess: () => {
      toast.success("Baseline обновлён");
      queryClient.invalidateQueries({ queryKey: ["tg-channels", botId] });
    },
    onError: (e: unknown) => {
      const msg =
        (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? "Не удалось обновить baseline";
      toast.error(msg);
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Каналы</h2>
          <p className="text-sm text-muted-foreground">
            Подключите каналы, в которых бот — администратор. После этого
            считаем вступления, выходы, и атрибутируем их к UTM-источникам через
            именные invite-link'и.
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Подключить канал
        </Button>
      </div>

      {isLoading ? (
        <div className="grid h-32 place-items-center text-sm text-muted-foreground">
          Загрузка…
        </div>
      ) : !channels?.length ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Ни одного канала ещё не подключено.<br />
            Добавьте бота в админы канала и нажмите «Подключить канал».
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {channels.map((c) => (
            <ChannelCard
              key={c.id}
              channel={c}
              botId={botId}
              onToggle={(v) => toggleMutation.mutate({ id: c.id, isActive: v })}
              onDelete={() => {
                if (confirm(`Отключить «${c.title}»? Накопленные membership'ы будут удалены.`)) {
                  deleteMutation.mutate(c.id);
                }
              }}
              onRefreshBaseline={() => refreshBaselineMutation.mutate(c.id)}
            />
          ))}
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Подключить канал</DialogTitle>
            <DialogDescription>
              Введите @username публичного канала или его chat_id (вида
              <code className="mx-1 rounded bg-muted px-1">-100…</code>) для
              приватного. Бот должен быть админом, иначе Telegram не отдаст
              события вступления.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label htmlFor="chan-input">Канал</Label>
            <Input
              id="chan-input"
              placeholder="@my_channel или -1001234567890"
              value={addValue}
              onChange={(e) => setAddValue(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAddOpen(false)}>
              Отмена
            </Button>
            <Button
              disabled={!addValue.trim() || addMutation.isPending}
              onClick={() => addMutation.mutate(addValue)}
            >
              Подключить
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ChannelCard({
  channel,
  botId,
  onToggle,
  onDelete,
  onRefreshBaseline,
}: {
  channel: Channel;
  botId: string;
  onToggle: (v: boolean) => void;
  onDelete: () => void;
  onRefreshBaseline: () => void;
}) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [linkName, setLinkName] = useState("");
  const [utmSource, setUtmSource] = useState("");
  const [utmCampaign, setUtmCampaign] = useState("");
  const [utmContent, setUtmContent] = useState("");

  const { data: links } = useQuery({
    queryKey: ["tg-channel-invite-links", botId, channel.id],
    enabled: open,
    queryFn: async () => {
      const r = await apiClient.get(
        `/admin/tg/bots/${botId}/channels/${channel.id}/invite-links`
      );
      return (r.data?.data ?? []) as InviteLink[];
    },
  });

  const createLink = useMutation({
    mutationFn: async () => {
      const utm: Record<string, string> = {};
      if (utmSource) utm.utm_source = utmSource;
      if (utmCampaign) utm.utm_campaign = utmCampaign;
      if (utmContent) utm.utm_content = utmContent;
      const r = await apiClient.post(
        `/admin/tg/bots/${botId}/channels/${channel.id}/invite-links`,
        { name: linkName, utm }
      );
      return r.data;
    },
    onSuccess: () => {
      toast.success("Ссылка создана");
      setCreateOpen(false);
      setLinkName("");
      setUtmSource("");
      setUtmCampaign("");
      setUtmContent("");
      queryClient.invalidateQueries({
        queryKey: ["tg-channel-invite-links", botId, channel.id],
      });
    },
    onError: (e: unknown) => {
      const msg =
        (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? "Не удалось создать ссылку";
      toast.error(msg);
    },
  });

  const revokeLink = useMutation({
    mutationFn: async (linkId: string) => {
      await apiClient.delete(
        `/admin/tg/bots/${botId}/channels/${channel.id}/invite-links/${linkId}`
      );
    },
    onSuccess: () => {
      toast.success("Ссылка отозвана");
      queryClient.invalidateQueries({
        queryKey: ["tg-channel-invite-links", botId, channel.id],
      });
    },
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-base">
              {channel.title}
              {!channel.isActive && (
                <Badge variant="secondary" className="ml-2 text-[10px]">
                  выключен
                </Badge>
              )}
            </CardTitle>
            <div className="text-xs text-muted-foreground">
              {channel.username ? `@${channel.username} · ` : ""}
              {channel.type} · chat_id <code className="text-[11px]">{channel.chatId}</code>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onToggle(!channel.isActive)}
            >
              {channel.isActive ? "Выключить" : "Включить"}
            </Button>
            <Button variant="ghost" size="sm" onClick={onRefreshBaseline} title="Обновить baseline">
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={onDelete} title="Удалить">
              <Trash2 className="h-4 w-4 text-rose-600" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-4 text-center">
          <Stat label="Сейчас (учтённых)" value={channel.membersNow} />
          <Stat label="Baseline до старта" value={channel.baselineCount} />
          <Stat label="Всего отслежено" value={channel.trackedTotal} />
        </div>

        <button
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          Трекинг-ссылки {links ? `(${links.length})` : ""}
        </button>

        {open && (
          <div className="space-y-2">
            <div className="flex justify-end">
              <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
                <Plus className="mr-1 h-3 w-3" />
                Создать ссылку
              </Button>
            </div>
            {!links?.length ? (
              <div className="text-xs text-muted-foreground">
                Ссылок пока нет. Создайте именную трекинг-ссылку — Telegram
                будет возвращать её имя при каждом вступлении, и мы припишем
                подписку к нужному источнику.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-1 pr-2 font-medium">Имя</th>
                    <th className="py-1 pr-2 font-medium">URL</th>
                    <th className="py-1 pr-2 font-medium">UTM</th>
                    <th className="py-1 pr-2 font-medium text-right">Подписалось</th>
                    <th className="py-1 pr-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {links.map((l) => (
                    <tr key={l.id} className="border-b last:border-0">
                      <td className="py-1 pr-2 font-mono text-xs">{l.name}</td>
                      <td className="py-1 pr-2">
                        <div className="flex items-center gap-1">
                          <code className="text-[11px] text-muted-foreground">
                            {l.inviteUrl}
                          </code>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => {
                              navigator.clipboard?.writeText(l.inviteUrl);
                              toast.success("Скопировано");
                            }}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      </td>
                      <td className="py-1 pr-2 text-xs text-muted-foreground">
                        {Object.entries(l.utm ?? {})
                          .map(([k, v]) => `${k}=${v}`)
                          .join(" · ")}
                      </td>
                      <td className="py-1 pr-2 text-right">{l.joinCount}</td>
                      <td className="py-1 pr-2 text-right">
                        {l.revokedAt ? (
                          <Badge variant="secondary" className="text-[10px]">
                            отозвана
                          </Badge>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => revokeLink.mutate(l.id)}
                            title="Отозвать"
                          >
                            <Trash2 className="h-3 w-3 text-rose-600" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </CardContent>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Новая трекинг-ссылка</DialogTitle>
            <DialogDescription>
              Имя ≤32 символов — Telegram вернёт его в каждом chat_member для
              атрибуции. UTM-поля — наши, для отчётов.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="lnk-name">Имя (slug)</Label>
              <Input
                id="lnk-name"
                value={linkName}
                onChange={(e) => setLinkName(e.target.value)}
                placeholder="например: vk_post_jun11"
                maxLength={32}
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label htmlFor="utm-s">utm_source</Label>
                <Input id="utm-s" value={utmSource} onChange={(e) => setUtmSource(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="utm-c">utm_campaign</Label>
                <Input id="utm-c" value={utmCampaign} onChange={(e) => setUtmCampaign(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="utm-ct">utm_content</Label>
                <Input id="utm-ct" value={utmContent} onChange={(e) => setUtmContent(e.target.value)} />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Отмена
            </Button>
            <Button
              disabled={!linkName.trim() || createLink.isPending}
              onClick={() => createLink.mutate()}
            >
              Создать
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}
