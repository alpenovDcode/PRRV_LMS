"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Bot, MessageSquare, UserCheck, Info, X } from "lucide-react";
import { type SubscriberDetail } from "./lead-sidebar";
import { LeadDossier } from "./lead-dossier";
import { ChatThread } from "./chat-thread";
import { MessageInput } from "./message-input";
import type { ChatMessage } from "./message-bubble";
import { toast } from "sonner";

interface SubscriberPayload {
  subscriber: SubscriberDetail;
  messages: ChatMessage[];
  activeRuns: Array<{
    id: string;
    status: string;
    flow: { name: string };
    currentNodeId: string | null;
    resumeAt: string | null;
  }>;
}

interface Props {
  botId: string;
  subscriberId: string;
  // embedded=true — режим для split-view мессенджера: компактный хедер
  // без «К подписчикам», высота h-full, инфо-панель сворачивается.
  embedded?: boolean;
}

export function ChatPage({ botId, subscriberId, embedded = false }: Props) {
  const queryClient = useQueryClient();
  const [pendingBubbles, setPendingBubbles] = useState<ChatMessage[]>([]);
  // Видимость правой инфо-панели (LeadSidebar). В embedded по умолчанию
  // скрыта — чат шире; открывается кнопкой ⓘ.
  const [showInfo, setShowInfo] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["tg-sub", botId, subscriberId],
    queryFn: async () => {
      const r = await apiClient.get(`/admin/tg/bots/${botId}/subscribers/${subscriberId}`);
      return r.data?.data as SubscriberPayload;
    },
  });

  // ВАЖНО: все хуки объявляются ДО любых ранних return. Иначе при
  // переходе loading → loaded меняется число вызванных хуков и React
  // падает с ошибкой #310 «Rendered fewer hooks than expected».
  // Operator takeover — пауза автоматики бота на этого подписчика.
  const operatorAction = useMutation({
    mutationFn: async (action: "takeover" | "release") => {
      const r = await apiClient.post(
        `/admin/tg/bots/${botId}/subscribers/${subscriberId}/operator`,
        { action }
      );
      return { action, data: r.data?.data };
    },
    onSuccess: ({ action }) => {
      toast.success(
        action === "takeover"
          ? "Диалог взят в ручной режим. Бот не будет реагировать на ответы."
          : "Бот вернулся в работу."
      );
      queryClient.invalidateQueries({ queryKey: ["tg-sub", botId, subscriberId] });
    },
    onError: () => toast.error("Не удалось переключить режим"),
  });

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-220px)] items-center justify-center text-sm text-muted-foreground">
        Загрузка…
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-sm text-muted-foreground">
        <span>Не удалось загрузить подписчика.</span>
        <Button size="sm" variant="outline" onClick={() => refetch()}>
          Повторить
        </Button>
      </div>
    );
  }

  const sub = data.subscriber;
  const name =
    [sub.firstName, sub.lastName].filter(Boolean).join(" ") || sub.chatId;

  async function sendMessage(text: string) {
    await apiClient.patch(`/admin/tg/bots/${botId}/subscribers/${subscriberId}`, {
      sendMessage: { text },
    });
  }

  // operatorActive — обычное вычисление (НЕ хук), может быть после return.
  const operatorActive = (() => {
    if (!sub.operatorTakeoverAt) return false;
    const ageMs = Date.now() - new Date(sub.operatorTakeoverAt).getTime();
    return ageMs < 24 * 60 * 60 * 1000;
  })();

  function handleSent(text: string) {
    const optimistic: ChatMessage = {
      id: `optimistic-${Date.now()}`,
      direction: "out",
      text,
      mediaType: null,
      mediaFileId: null,
      callbackData: null,
      sourceType: "manual",
      sourceId: null,
      rawPayload: null,
      createdAt: new Date().toISOString(),
      pending: true,
    };
    setPendingBubbles((prev) => [...prev, optimistic]);
    // Force a quick re-fetch so the real bubble shows up faster than the
    // 5s polling interval. The thread's merge step dedupes optimistic vs real.
    queryClient.invalidateQueries({ queryKey: ["tg-sub-messages", botId, subscriberId] });
    // Clean stale optimistic markers after 15s as a safety net.
    setTimeout(() => {
      setPendingBubbles((prev) =>
        prev.filter((p) => p.id !== optimistic.id || (p.pending ?? false))
      );
      setPendingBubbles((prev) => prev.filter((p) => p.id !== optimistic.id));
    }, 15_000);
  }

  // Кнопки переключения операторского режима — общие для обоих layout’ов.
  const operatorButton = operatorActive ? (
    <Button
      variant="outline"
      size="sm"
      disabled={operatorAction.isPending}
      onClick={() => operatorAction.mutate("release")}
    >
      <Bot className="mr-1 h-4 w-4" /> Вернуть бота
    </Button>
  ) : (
    <Button
      variant="outline"
      size="sm"
      disabled={operatorAction.isPending}
      onClick={() => operatorAction.mutate("takeover")}
    >
      <UserCheck className="mr-1 h-4 w-4" /> Взять диалог
    </Button>
  );

  // ---- embedded режим: для split-view мессенджера ------------------------
  if (embedded) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-100 px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="truncate text-sm font-semibold">{name}</h2>
            {sub.isBlocked ? (
              <Badge variant="destructive" className="text-[10px]">blocked</Badge>
            ) : null}
            {operatorActive && (
              <Badge className="border border-purple-300 bg-purple-100 text-[10px] text-purple-800">
                <UserCheck className="mr-0.5 h-2.5 w-2.5" />
                ручной
              </Badge>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {operatorButton}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowInfo((v) => !v)}
              title="Информация о подписчике"
            >
              {showInfo ? <X className="h-4 w-4" /> : <Info className="h-4 w-4" />}
            </Button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col bg-card">
            <ChatThread
              botId={botId}
              subscriberId={subscriberId}
              pendingBubbles={pendingBubbles}
            />
            <MessageInput
              botId={botId}
              subscriberId={subscriberId}
              isBlocked={sub.isBlocked}
              onSent={handleSent}
              sendMessage={sendMessage}
            />
          </div>
          {showInfo && (
            <div className="w-80 shrink-0 overflow-y-auto border-l border-zinc-200 bg-white p-3">
              <LeadDossier
                botId={botId}
                subscriberId={subscriberId}
                subscriber={sub}
                activeRuns={data.activeRuns}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---- standalone режим: отдельная страница /subscribers/[id] ------------
  return (
    <div className="flex flex-col gap-3">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild size="sm" variant="ghost" className="-ml-2">
            <Link href={`/admin/bots/${botId}/subscribers`}>
              <ArrowLeft className="mr-1 h-4 w-4" />К подписчикам
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-base font-semibold">{name}</h2>
            {sub.isBlocked ? (
              <Badge variant="destructive">blocked</Badge>
            ) : (
              <Badge>active</Badge>
            )}
            {operatorActive && (
              <Badge className="bg-purple-100 text-purple-800 border border-purple-300">
                <UserCheck className="h-3 w-3 mr-1" />
                Ручной режим
              </Badge>
            )}
          </div>
        </div>
        <div>{operatorButton}</div>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-4 lg:self-start">
          <LeadDossier
            botId={botId}
            subscriberId={subscriberId}
            subscriber={sub}
            activeRuns={data.activeRuns}
          />
        </div>

        <div className="flex h-[calc(100vh-220px)] min-h-[480px] flex-col rounded-lg border bg-card">
          <ChatThread
            botId={botId}
            subscriberId={subscriberId}
            pendingBubbles={pendingBubbles}
          />
          <MessageInput
            botId={botId}
            subscriberId={subscriberId}
            isBlocked={sub.isBlocked}
            onSent={handleSent}
            sendMessage={sendMessage}
          />
        </div>
      </div>
    </div>
  );
}
