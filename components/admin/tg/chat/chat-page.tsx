"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, MessageSquare } from "lucide-react";
import { LeadSidebar, type SubscriberDetail } from "./lead-sidebar";
import { ChatThread } from "./chat-thread";
import { MessageInput } from "./message-input";
import type { ChatMessage } from "./message-bubble";

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
}

export function ChatPage({ botId, subscriberId }: Props) {
  const queryClient = useQueryClient();
  const [pendingBubbles, setPendingBubbles] = useState<ChatMessage[]>([]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["tg-sub", botId, subscriberId],
    queryFn: async () => {
      const r = await apiClient.get(`/admin/tg/bots/${botId}/subscribers/${subscriberId}`);
      return r.data?.data as SubscriberPayload;
    },
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
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-4 lg:self-start">
          <LeadSidebar
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
