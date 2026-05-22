"use client";

// Левая панель мессенджер-вида: список диалогов в стиле Telegram.
// Поиск + фильтры сверху, бесконечная прокрутка, активное выделение.

import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Input } from "@/components/ui/input";
import { Search, Inbox, UserCheck, CircleDot } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Conversation {
  id: string;
  chatId: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  tags: string[];
  isBlocked: boolean;
  operatorActive: boolean;
  subscribedAt: string;
  lastActivityAt: string;
  needsReply: boolean;
  lastMessage: {
    text: string | null;
    direction: string | null;
    mediaType: string | null;
    createdAt: string;
  } | null;
}

interface ConversationsPage {
  items: Conversation[];
  total: number;
  page: number;
  pageSize: number;
}

interface Props {
  botId: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

// -- helpers ----------------------------------------------------------------

// Стабильный цвет аватара по id подписчика — как в Telegram, где у
// каждого собеседника свой цвет кружка.
const AVATAR_COLORS = [
  "bg-rose-500", "bg-orange-500", "bg-amber-500", "bg-emerald-500",
  "bg-teal-500", "bg-sky-500", "bg-indigo-500", "bg-purple-500",
  "bg-pink-500",
];
function avatarColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
function initials(c: Conversation): string {
  const f = c.firstName?.trim()?.[0] ?? "";
  const l = c.lastName?.trim()?.[0] ?? "";
  const combined = (f + l).toUpperCase();
  if (combined) return combined;
  return c.chatId.slice(-2);
}
function displayName(c: Conversation): string {
  const n = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
  return n || (c.username ? "@" + c.username : c.chatId);
}

// Время в стиле мессенджера: сегодня → HH:MM, вчера → «вчера»,
// в пределах недели → день недели, иначе → DD.MM.YY.
const WEEKDAYS = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
function shortTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  if (sameDay) {
    return `${String(d.getHours()).padStart(2, "0")}:${String(
      d.getMinutes()
    ).padStart(2, "0")}`;
  }
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays <= 1) return "вчера";
  if (diffDays < 7) return WEEKDAYS[d.getDay()];
  return d.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

// Превью последнего сообщения. Медиа без текста — иконкой-словом.
const MEDIA_LABEL: Record<string, string> = {
  photo: "📷 Фото",
  video: "🎥 Видео",
  voice: "🎤 Голосовое",
  video_note: "⭕ Кружочек",
  audio: "🎵 Аудио",
  document: "📄 Файл",
  animation: "🎬 GIF",
};
function preview(c: Conversation): string {
  const m = c.lastMessage;
  if (!m) return "нет сообщений";
  const body =
    m.text?.trim() ||
    (m.mediaType ? MEDIA_LABEL[m.mediaType] ?? "вложение" : "—");
  const prefix = m.direction === "out" ? "Вы: " : "";
  return prefix + body;
}

// -- component --------------------------------------------------------------

export function ConversationList({ botId, selectedId, onSelect }: Props) {
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [needsReplyOnly, setNeedsReplyOnly] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Дебаунс поиска — 300 мс, чтобы не дёргать API на каждую букву.
  useEffect(() => {
    const t = setTimeout(() => setQ(qInput.trim()), 300);
    return () => clearTimeout(t);
  }, [qInput]);

  const query = useInfiniteQuery({
    queryKey: ["tg-conversations", botId, q, needsReplyOnly],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const r = await apiClient.get(
        `/admin/tg/bots/${botId}/conversations`,
        {
          params: {
            q: q || undefined,
            needsReply: needsReplyOnly ? "true" : undefined,
            page: pageParam,
            pageSize: 40,
          },
        }
      );
      return r.data?.data as ConversationsPage;
    },
    getNextPageParam: (lastPage) =>
      lastPage.items.length === lastPage.pageSize
        ? lastPage.page + 1
        : undefined,
    refetchInterval: 20_000, // лёгкий polling — список «живой»
  });

  const conversations = useMemo(
    () => query.data?.pages.flatMap((p) => p.items) ?? [],
    [query.data]
  );
  const total = query.data?.pages[0]?.total ?? 0;

  // Бесконечная прокрутка — догружаем при подходе к низу.
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    if (
      el.scrollHeight - el.scrollTop - el.clientHeight < 240 &&
      query.hasNextPage &&
      !query.isFetchingNextPage
    ) {
      query.fetchNextPage();
    }
  };

  return (
    <div className="flex h-full flex-col border-r border-zinc-200 bg-white">
      {/* Шапка: поиск + фильтр */}
      <div className="shrink-0 space-y-2 border-b border-zinc-100 p-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <Input
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="Поиск по имени, @username, chat_id"
            className="h-9 pl-8 text-sm"
          />
        </div>
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setNeedsReplyOnly((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
              needsReplyOnly
                ? "border-amber-300 bg-amber-50 text-amber-800"
                : "border-zinc-200 text-zinc-500 hover:bg-zinc-50"
            )}
          >
            <Inbox className="h-3.5 w-3.5" />
            Ждут ответа
          </button>
          <span className="text-[11px] text-zinc-400">
            {total > 0 ? `всего ${total.toLocaleString("ru-RU")}` : ""}
          </span>
        </div>
      </div>

      {/* Список */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        {query.isLoading ? (
          <div className="p-6 text-center text-sm text-zinc-400">Загрузка…</div>
        ) : conversations.length === 0 ? (
          <div className="p-6 text-center text-sm text-zinc-400">
            {q || needsReplyOnly ? "Ничего не найдено" : "Диалогов пока нет"}
          </div>
        ) : (
          conversations.map((c) => (
            <ConversationRow
              key={c.id}
              conv={c}
              active={c.id === selectedId}
              onClick={() => onSelect(c.id)}
            />
          ))
        )}
        {query.isFetchingNextPage && (
          <div className="p-3 text-center text-xs text-zinc-400">Загрузка…</div>
        )}
      </div>
    </div>
  );
}

function ConversationRow({
  conv,
  active,
  onClick,
}: {
  conv: Conversation;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 border-b border-zinc-50 px-3 py-2.5 text-left transition-colors",
        active ? "bg-purple-50" : "hover:bg-zinc-50"
      )}
    >
      {/* Аватар */}
      <div className="relative shrink-0">
        <div
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-full text-sm font-semibold text-white",
            avatarColor(conv.id)
          )}
        >
          {initials(conv)}
        </div>
        {conv.operatorActive && (
          <span
            className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-purple-600 ring-2 ring-white"
            title="Ручной режим оператора"
          >
            <UserCheck className="h-2.5 w-2.5 text-white" />
          </span>
        )}
      </div>

      {/* Текст */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              "truncate text-sm",
              active ? "font-semibold text-purple-900" : "font-medium text-zinc-800"
            )}
          >
            {displayName(conv)}
          </span>
          <span className="shrink-0 text-[11px] text-zinc-400">
            {shortTime(conv.lastActivityAt)}
          </span>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <span
            className={cn(
              "truncate text-xs",
              conv.needsReply ? "text-zinc-700" : "text-zinc-400"
            )}
          >
            {preview(conv)}
          </span>
          {conv.needsReply && (
            <CircleDot
              className="h-3.5 w-3.5 shrink-0 text-amber-500"
              aria-label="Ждёт ответа"
            />
          )}
        </div>
        {conv.tags.length > 0 && (
          <div className="mt-1 flex gap-1 overflow-hidden">
            {conv.tags.slice(0, 3).map((t) => (
              <span
                key={t}
                className="truncate rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500"
              >
                {t}
              </span>
            ))}
            {conv.tags.length > 3 && (
              <span className="text-[10px] text-zinc-400">
                +{conv.tags.length - 3}
              </span>
            )}
          </div>
        )}
      </div>
    </button>
  );
}
