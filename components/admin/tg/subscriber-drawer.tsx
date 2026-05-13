"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { X, Plus, Send } from "lucide-react";

interface Props {
  botId: string;
  subscriberId: string;
  onClose: () => void;
}

export function SubscriberDrawer({ botId, subscriberId, onClose }: Props) {
  const queryClient = useQueryClient();
  const [newTag, setNewTag] = useState("");
  const [varKey, setVarKey] = useState("");
  const [varValue, setVarValue] = useState("");
  const [messageText, setMessageText] = useState("");
  const [flowId, setFlowId] = useState("");

  const { data } = useQuery({
    queryKey: ["tg-sub", botId, subscriberId],
    queryFn: async () => {
      const r = await apiClient.get(`/admin/tg/bots/${botId}/subscribers/${subscriberId}`);
      return r.data?.data as {
        subscriber: {
          firstName: string | null;
          lastName: string | null;
          username: string | null;
          chatId: string;
          tags: string[];
          variables: Record<string, unknown>;
          isBlocked: boolean;
          lastSeenAt: string | null;
          firstTouchSlug: string | null;
        };
        messages: Array<{
          id: string;
          direction: string;
          text: string | null;
          callbackData: string | null;
          createdAt: string;
        }>;
        activeRuns: Array<{
          id: string;
          status: string;
          flow: { name: string };
          currentNodeId: string | null;
          resumeAt: string | null;
        }>;
      };
    },
  });

  const { data: flowsList } = useQuery({
    queryKey: ["tg-flows-list", botId],
    queryFn: async () => {
      const r = await apiClient.get(`/admin/tg/bots/${botId}/flows`);
      return (r.data?.data ?? []) as Array<{ id: string; name: string }>;
    },
  });

  const patch = useMutation({
    mutationFn: async (body: any) =>
      apiClient.patch(`/admin/tg/bots/${botId}/subscribers/${subscriberId}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tg-sub", botId, subscriberId] });
      queryClient.invalidateQueries({ queryKey: ["tg-subs", botId] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.error?.message || "Ошибка"),
  });

  const sub = data?.subscriber;
  const name = sub
    ? [sub.firstName, sub.lastName].filter(Boolean).join(" ") || sub.chatId
    : "...";

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center justify-between">
            <span>{name}</span>
            {sub?.isBlocked && <Badge variant="destructive">blocked</Badge>}
          </SheetTitle>
        </SheetHeader>

        {!sub ? (
          <div className="py-6 text-sm text-muted-foreground">Загрузка...</div>
        ) : (
          <div className="space-y-6 py-4">
            <section>
              <div className="text-xs text-muted-foreground">
                @{sub.username ?? "—"} · chat: {sub.chatId}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Источник: {sub.firstTouchSlug ?? "—"} · Последняя активность:{" "}
                {sub.lastSeenAt ? new Date(sub.lastSeenAt).toLocaleString("ru-RU") : "—"}
              </div>
            </section>

            <section className="space-y-2">
              <Label>Теги</Label>
              <div className="flex flex-wrap gap-1">
                {sub.tags.map((t) => (
                  <Badge key={t} variant="secondary" className="flex items-center gap-1">
                    {t}
                    <button
                      onClick={() => patch.mutate({ removeTags: [t] })}
                      className="hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                {sub.tags.length === 0 && (
                  <span className="text-xs text-muted-foreground">пока нет тегов</span>
                )}
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="новый тег"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                />
                <Button
                  size="sm"
                  onClick={() => {
                    if (!newTag.trim()) return;
                    patch.mutate({ addTags: [newTag.trim()] });
                    setNewTag("");
                  }}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </section>

            <section className="space-y-2">
              <Label>Переменные</Label>
              <div className="space-y-1 text-sm">
                {Object.entries(sub.variables ?? {}).map(([k, v]) => (
                  <div key={k} className="flex justify-between border-b py-1 last:border-0">
                    <span className="font-mono text-xs">{k}</span>
                    <span className="text-xs text-muted-foreground truncate max-w-[55%]">
                      {String(v)}
                    </span>
                  </div>
                ))}
                {Object.keys(sub.variables ?? {}).length === 0 && (
                  <span className="text-xs text-muted-foreground">пусто</span>
                )}
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="ключ"
                  value={varKey}
                  onChange={(e) => setVarKey(e.target.value)}
                />
                <Input
                  placeholder="значение"
                  value={varValue}
                  onChange={(e) => setVarValue(e.target.value)}
                />
                <Button
                  size="sm"
                  onClick={() => {
                    if (!varKey.trim()) return;
                    patch.mutate({ setVariables: { [varKey.trim()]: varValue } });
                    setVarKey("");
                    setVarValue("");
                  }}
                >
                  ок
                </Button>
              </div>
            </section>

            <section className="space-y-2">
              <Label>Активные сценарии</Label>
              {!data.activeRuns.length ? (
                <div className="text-xs text-muted-foreground">нет активных</div>
              ) : (
                data.activeRuns.map((r) => (
                  <div key={r.id} className="text-xs flex justify-between border-b py-1 last:border-0">
                    <span>{r.flow.name}</span>
                    <span className="text-muted-foreground">{r.status}</span>
                  </div>
                ))
              )}
            </section>

            <section className="space-y-2">
              <Label>Отправить сообщение</Label>
              <Textarea
                rows={3}
                placeholder="Текст (HTML: <b>, <i>, <a>)"
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
              />
              <Button
                size="sm"
                disabled={!messageText.trim() || sub.isBlocked}
                onClick={() => {
                  patch.mutate({
                    sendMessage: { text: messageText.trim() },
                  });
                  setMessageText("");
                  toast.success("Отправлено");
                }}
              >
                <Send className="mr-2 h-3 w-3" /> Отправить
              </Button>
            </section>

            <section className="space-y-2">
              <Label>Запустить сценарий</Label>
              <select
                className="w-full rounded border px-2 py-2 text-sm"
                value={flowId}
                onChange={(e) => setFlowId(e.target.value)}
              >
                <option value="">— выберите сценарий —</option>
                {(flowsList ?? []).map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                disabled={!flowId || sub.isBlocked}
                onClick={() => {
                  patch.mutate({ startFlowId: flowId });
                  toast.success("Сценарий запущен");
                }}
              >
                Запустить
              </Button>
            </section>

            <section>
              <Label>Последние сообщения</Label>
              <div className="mt-2 max-h-64 space-y-1 overflow-y-auto rounded border p-2 text-xs">
                {data.messages.map((m) => (
                  <div key={m.id} className="border-b py-1 last:border-0">
                    <span
                      className={
                        m.direction === "out"
                          ? "text-blue-600 font-medium"
                          : "text-emerald-600 font-medium"
                      }
                    >
                      {m.direction === "out" ? "↗" : "↘"}
                    </span>{" "}
                    <span className="text-muted-foreground">
                      {new Date(m.createdAt).toLocaleTimeString("ru-RU")}
                    </span>{" "}
                    {m.text ? m.text.substring(0, 200) : m.callbackData ? `🔘 ${m.callbackData}` : "—"}
                  </div>
                ))}
                {data.messages.length === 0 && (
                  <span className="text-muted-foreground">пусто</span>
                )}
              </div>
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
