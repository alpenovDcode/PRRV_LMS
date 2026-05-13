"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { ArrowDown, Loader2 } from "lucide-react";
import { groupMessagesIntoBursts } from "@/lib/tg/chat-helpers";
import { DateDivider } from "./date-divider";
import { MessageBubble, type ChatMessage } from "./message-bubble";

interface MessagesPage {
  items: ChatMessage[];
  nextCursor: string | null;
  total: number;
  sources: {
    flows: Record<string, string>;
    broadcasts: Record<string, string>;
  };
}

interface Props {
  botId: string;
  subscriberId: string;
  /** Bubbles that have been sent optimistically but not yet acknowledged by polling. */
  pendingBubbles: ChatMessage[];
}

export function ChatThread({ botId, subscriberId, pendingBubbles }: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const lastSeenFirstId = useRef<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  const query = useInfiniteQuery({
    queryKey: ["tg-sub-messages", botId, subscriberId],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const r = await apiClient.get(
        `/admin/tg/bots/${botId}/subscribers/${subscriberId}/messages`,
        { params: { cursor: pageParam ?? undefined, limit: 50 } }
      );
      return r.data?.data as MessagesPage;
    },
    // Backwards pagination — "previous" pages are older history above the
    // current view. nextCursor returned by the API is the oldest id in the
    // page just returned.
    getNextPageParam: () => null, // we never paginate "forwards" in time
    getPreviousPageParam: (firstPage) => firstPage?.nextCursor ?? null,
    refetchInterval: 5_000,
    refetchOnWindowFocus: true,
  });

  // useInfiniteQuery returns pages in fetch order. The first page (index 0)
  // is the most recent slice; subsequent pages are older. To render the
  // thread top-to-bottom (oldest -> newest), reverse the page list and
  // concat each page's items (already ASC within a page).
  const allMessages = useMemo<ChatMessage[]>(() => {
    if (!query.data) return [];
    const ordered = [...query.data.pages].reverse();
    const flat: ChatMessage[] = [];
    for (const page of ordered) flat.push(...page.items);
    return flat;
  }, [query.data]);

  const { flowsById, broadcastsById } = useMemo(() => {
    const flows: Record<string, string> = {};
    const broadcasts: Record<string, string> = {};
    for (const page of query.data?.pages ?? []) {
      Object.assign(flows, page.sources.flows);
      Object.assign(broadcasts, page.sources.broadcasts);
    }
    return { flowsById: flows, broadcastsById: broadcasts };
  }, [query.data]);

  const merged = useMemo<ChatMessage[]>(() => {
    if (pendingBubbles.length === 0) return allMessages;
    // Filter out optimistic bubbles whose text already appears in the newest
    // outbound message — the polling cycle has caught up.
    const recentOutTexts = new Set(
      allMessages
        .filter((m) => m.direction === "out")
        .slice(-10)
        .map((m) => (m.text ?? "").trim())
        .filter(Boolean)
    );
    const stillPending = pendingBubbles.filter(
      (p) => p.text && !recentOutTexts.has(p.text.trim())
    );
    return [...allMessages, ...stillPending];
  }, [allMessages, pendingBubbles]);

  const bursts = useMemo(() => groupMessagesIntoBursts(merged), [merged]);

  // Detect arrival of new messages on the first page.
  useEffect(() => {
    const firstPage = query.data?.pages[0];
    if (!firstPage?.items.length) return;
    const newestId = firstPage.items[firstPage.items.length - 1]?.id ?? null;
    if (!newestId) return;
    if (lastSeenFirstId.current === null) {
      lastSeenFirstId.current = newestId;
      // Initial load — scroll to bottom.
      requestAnimationFrame(() => {
        scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight });
      });
      return;
    }
    if (lastSeenFirstId.current !== newestId) {
      const el = scrollerRef.current;
      const atBottom = el
        ? el.scrollHeight - el.scrollTop - el.clientHeight < 80
        : true;
      if (atBottom) {
        requestAnimationFrame(() => {
          if (scrollerRef.current) {
            scrollerRef.current.scrollTo({
              top: scrollerRef.current.scrollHeight,
              behavior: "smooth",
            });
          }
        });
        setUnreadCount(0);
      } else {
        // Count new messages since last seen.
        const newMessages = firstPage.items.filter((m) => {
          // Anything newer than the previously seen newest.
          return m.id !== lastSeenFirstId.current;
        });
        setUnreadCount((c) => c + newMessages.length);
      }
      lastSeenFirstId.current = newestId;
    }
  }, [query.data]);

  // Intersection-based "load more" upward.
  useEffect(() => {
    const sentinel = topSentinelRef.current;
    const root = scrollerRef.current;
    if (!sentinel || !root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (
            e.isIntersecting &&
            query.hasPreviousPage &&
            !query.isFetchingPreviousPage
          ) {
            const prevHeight = root.scrollHeight;
            const prevTop = root.scrollTop;
            query.fetchPreviousPage().then(() => {
              // Preserve scroll position after prepending older messages.
              requestAnimationFrame(() => {
                if (!scrollerRef.current) return;
                const delta = scrollerRef.current.scrollHeight - prevHeight;
                scrollerRef.current.scrollTop = prevTop + delta;
              });
            });
          }
        }
      },
      { root, rootMargin: "100px 0px 0px 0px", threshold: 0 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [query]);

  const scrollToBottom = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setUnreadCount(0);
  }, []);

  if (query.isLoading) {
    return (
      <div className="flex-1 space-y-3 p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className={`flex ${i % 2 ? "justify-end" : "justify-start"}`}
            aria-hidden
          >
            <div
              className="h-10 w-1/2 animate-pulse rounded-2xl bg-zinc-100"
              style={{ width: `${30 + ((i * 17) % 30)}%` }}
            />
          </div>
        ))}
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
        <span>Не удалось загрузить историю.</span>
        <Button size="sm" variant="outline" onClick={() => query.refetch()}>
          Повторить
        </Button>
      </div>
    );
  }

  if (merged.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
        Сообщений пока нет. Напишите первым.
      </div>
    );
  }

  return (
    <div className="relative flex-1 min-h-0">
      <div
        ref={scrollerRef}
        className="h-full overflow-y-auto px-4 py-4"
        role="log"
        aria-live="polite"
      >
        <div ref={topSentinelRef} />
        {query.isFetchingPreviousPage ? (
          <div className="flex items-center justify-center py-2 text-xs text-muted-foreground">
            <Loader2 className="mr-2 h-3 w-3 animate-spin" /> загружаем историю...
          </div>
        ) : null}

        <div className="space-y-1">
          {bursts.map((burst, burstIdx) => {
            const prev = bursts[burstIdx - 1];
            const showDateDivider = !prev || prev.dateKey !== burst.dateKey;
            const burstDate = burst.messages[0]
              ? new Date(burst.messages[0].createdAt)
              : new Date();
            return (
              <div key={`burst-${burstIdx}-${burst.dateKey}-${burst.direction}`}>
                {showDateDivider ? <DateDivider date={burstDate} /> : null}
                <div className="space-y-0.5">
                  {burst.messages.map((m, idx) => (
                    <MessageBubble
                      key={m.id}
                      botId={botId}
                      message={m}
                      showTimestamp={idx === burst.messages.length - 1}
                      flowsById={flowsById}
                      broadcastsById={broadcastsById}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {unreadCount > 0 ? (
        <button
          type="button"
          onClick={scrollToBottom}
          className="absolute bottom-4 left-1/2 inline-flex -translate-x-1/2 items-center gap-2 rounded-full bg-primary px-3 py-1 text-xs font-medium text-white shadow-md hover:opacity-90"
        >
          <ArrowDown className="h-3 w-3" />
          {unreadCount} новых
        </button>
      ) : null}
    </div>
  );
}
