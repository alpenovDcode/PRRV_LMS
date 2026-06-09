"use client";

/**
 * /admin/messaging/[botId]/subscribers — реестр подписчиков MAX-бота
 * в стиле мессенджера. Аналог /admin/bots/[id]/subscribers у TG.
 *
 * Отличие от Inbox: тут ВСЕ подписчики, даже те кто никогда не писал —
 * нужно для импорта баз, обзвона, аналитики. Поиск, фильтр по тегу,
 * пагинация. Справа открывается переписка (если есть).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Download,
  Hand,
  Loader2,
  MessageSquare,
  RefreshCw,
  Search,
  Send,
  Upload,
  Users,
  X,
} from "lucide-react";

interface Subscriber {
  id: string;
  externalUserId: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  tags: string[];
  subscribedAt: string;
  lastInboundAt: string | null;
  lastSeenAt: string | null;
  operatorTakeoverAt: string | null;
  lmsUser: { id: string; email: string; fullName: string | null } | null;
}

interface ListResp {
  items: Subscriber[];
  total: number;
  page: number;
  pages: number;
  tagCloud: Array<{ tag: string; count: number }>;
}

interface Message {
  id: string;
  direction: "in" | "out";
  text: string | null;
  createdAt: string;
}

function fmtTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date();
  if (
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear()
  ) {
    return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function MessagingBotSubscribersPage() {
  const { botId } = useParams<{ botId: string }>();
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState<string>("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListResp | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingM, setLoadingM] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Debounced search — не дёргаем сервер на каждое нажатие
  const [searchDebounced, setSearchDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const loadList = () => {
    setLoadingList(true);
    const sp = new URLSearchParams({ page: String(page), pageSize: "50" });
    if (searchDebounced.trim()) sp.set("q", searchDebounced.trim());
    if (tag) sp.set("tag", tag);
    fetch(`/api/admin/messaging/bots/${botId}/subscribers?${sp.toString()}`)
      .then((r) => r.json())
      .then((d) => setData(d.success ? d.data : null))
      .finally(() => setLoadingList(false));
  };

  useEffect(loadList, [botId, page, searchDebounced, tag]);

  const loadMessages = (subId: string) => {
    setLoadingM(true);
    fetch(`/api/admin/messaging/subscribers/${subId}/messages`)
      .then((r) => r.json())
      .then((d) => setMessages(d.data ?? []))
      .finally(() => setLoadingM(false));
  };

  useEffect(() => {
    if (selectedId) loadMessages(selectedId);
    else setMessages([]);
  }, [selectedId]);

  // Авто-скролл вниз при появлении новых сообщений
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const selected = useMemo(
    () => data?.items.find((s) => s.id === selectedId) ?? null,
    [data, selectedId]
  );

  const handleReply = async () => {
    if (!selected || !replyText.trim()) return;
    setSending(true);
    try {
      const res = await fetch(
        `/api/admin/messaging/subscribers/${selected.id}/reply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: replyText.trim() }),
        }
      );
      const data = await res.json();
      if (res.ok && data.success) {
        setReplyText("");
        loadMessages(selected.id);
      } else {
        alert(data.error ?? "Не удалось отправить");
      }
    } finally {
      setSending(false);
    }
  };

  const handleTakeoverToggle = async () => {
    if (!selected) return;
    const isTakingOver = !selected.operatorTakeoverAt;
    const res = await fetch(
      `/api/admin/messaging/subscribers/${selected.id}/takeover`,
      { method: isTakingOver ? "POST" : "DELETE" }
    );
    if (res.ok) {
      loadList();
    }
  };

  return (
    <div className="max-w-[1500px] mx-auto space-y-3">
      {/* Тулбар */}
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm text-muted-foreground">
          Всего подписчиков:{" "}
          <span className="font-semibold text-foreground">
            {data?.total.toLocaleString("ru-RU") ?? "—"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled
            title="Импорт CSV для MAX-бота — в ближайшем этапе"
          >
            <Upload className="mr-1 h-4 w-4" /> Импорт CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              (window.location.href = `/api/admin/messaging/bots/${botId}/subscribers/export`)
            }
          >
            <Download className="mr-1 h-4 w-4" /> Экспорт CSV
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={loadList}
            title="Обновить список"
          >
            <RefreshCw
              className={`h-4 w-4 ${loadingList ? "animate-spin" : ""}`}
            />
          </Button>
        </div>
      </div>

      {/* Tag cloud */}
      {data && data.tagCloud.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tag && (
            <Badge
              variant="outline"
              className="bg-blue-50 border-blue-300 text-blue-700 cursor-pointer"
              onClick={() => {
                setTag("");
                setPage(1);
              }}
            >
              {tag} <X className="ml-1 h-3 w-3" />
            </Badge>
          )}
          {data.tagCloud.slice(0, 10).map((t) => (
            <Badge
              key={t.tag}
              variant="outline"
              className={
                tag === t.tag
                  ? "bg-blue-50 border-blue-300 text-blue-700 cursor-pointer"
                  : "cursor-pointer hover:bg-zinc-50"
              }
              onClick={() => {
                setTag(t.tag === tag ? "" : t.tag);
                setPage(1);
              }}
            >
              {t.tag}{" "}
              <span className="ml-1 text-muted-foreground font-mono text-[10px]">
                {t.count}
              </span>
            </Badge>
          ))}
        </div>
      )}

      {/* Messenger layout */}
      <div className="flex h-[calc(100vh-280px)] min-h-[480px] rounded-lg border border-zinc-200 overflow-hidden">
        {/* Левая колонка — список */}
        <div
          className={
            (selectedId ? "hidden md:flex " : "flex ") +
            "flex-col md:w-[340px] md:flex-none border-r border-zinc-100 min-h-0"
          }
        >
          <div className="p-2 border-b border-zinc-100">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-zinc-400" />
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Имя, @username, email…"
                className="pl-8 h-9"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loadingList && !data ? (
              <div className="p-6 text-center text-sm text-zinc-400">
                Загрузка…
              </div>
            ) : !data || data.items.length === 0 ? (
              <div className="p-6 text-center text-sm text-zinc-400">
                Никого не нашлось
              </div>
            ) : (
              data.items.map((s) => {
                const isActive = s.id === selectedId;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedId(s.id)}
                    className={`w-full text-left flex items-center gap-2 px-3 py-2 border-b border-zinc-50 transition-colors ${
                      isActive ? "bg-blue-50" : "hover:bg-zinc-50"
                    }`}
                  >
                    <div className="h-9 w-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-semibold shrink-0">
                      {s.name.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">
                          {s.name}
                        </span>
                        <span className="text-[10px] text-zinc-400 shrink-0">
                          {fmtTime(s.lastInboundAt ?? s.subscribedAt)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 truncate text-xs text-zinc-500">
                        {s.operatorTakeoverAt && (
                          <Hand className="h-3 w-3 text-amber-600" />
                        )}
                        {s.username
                          ? `@${s.username}`
                          : s.lmsUser?.email
                            ? s.lmsUser.email
                            : s.externalUserId}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Пагинация */}
          {data && data.pages > 1 && (
            <div className="flex items-center justify-between border-t border-zinc-100 px-2 py-1.5 text-xs">
              <Button
                size="sm"
                variant="ghost"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                ←
              </Button>
              <span className="text-zinc-500">
                {page} / {data.pages}
              </span>
              <Button
                size="sm"
                variant="ghost"
                disabled={page >= data.pages}
                onClick={() => setPage((p) => p + 1)}
              >
                →
              </Button>
            </div>
          )}
        </div>

        {/* Правая колонка — диалог */}
        <div
          className={
            (selectedId ? "flex " : "hidden md:flex ") +
            "min-w-0 flex-1 flex-col min-h-0"
          }
        >
          {selected ? (
            <>
              {/* Шапка диалога */}
              <div className="flex items-center justify-between gap-2 border-b border-zinc-100 px-3 py-2">
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  className="md:hidden text-sm text-zinc-600"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{selected.name}</div>
                  <div className="text-xs text-zinc-500 truncate">
                    {selected.username
                      ? `@${selected.username} · `
                      : ""}
                    {selected.lmsUser?.email
                      ? selected.lmsUser.email
                      : "не привязан к LMS"}
                    {" · подписан "}
                    {fmtDateTime(selected.subscribedAt)}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant={
                    selected.operatorTakeoverAt ? "default" : "outline"
                  }
                  onClick={handleTakeoverToggle}
                  className={
                    selected.operatorTakeoverAt
                      ? "bg-amber-500 hover:bg-amber-600"
                      : ""
                  }
                  title={
                    selected.operatorTakeoverAt
                      ? "Вернуть управление боту"
                      : "Взять диалог под ручное управление"
                  }
                >
                  <Hand className="h-3.5 w-3.5 mr-1" />
                  {selected.operatorTakeoverAt ? "Я веду" : "Взять диалог"}
                </Button>
              </div>

              {/* История */}
              <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto p-3 bg-zinc-50 space-y-1.5"
              >
                {loadingM ? (
                  <div className="text-center text-sm text-zinc-400 pt-6">
                    <Loader2 className="h-4 w-4 animate-spin inline mr-1" />
                    Загрузка…
                  </div>
                ) : messages.length === 0 ? (
                  <div className="text-center text-sm text-zinc-400 pt-6">
                    Сообщений пока нет
                  </div>
                ) : (
                  messages.map((m) => (
                    <div
                      key={m.id}
                      className={`flex ${
                        m.direction === "out" ? "justify-end" : "justify-start"
                      }`}
                    >
                      <div
                        className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                          m.direction === "out"
                            ? "bg-blue-500 text-white"
                            : "bg-white border border-zinc-200"
                        }`}
                      >
                        <div className="whitespace-pre-wrap break-words">
                          {m.text ?? "—"}
                        </div>
                        <div
                          className={`text-[10px] mt-1 ${
                            m.direction === "out"
                              ? "text-blue-100"
                              : "text-zinc-400"
                          }`}
                        >
                          {new Date(m.createdAt).toLocaleString("ru-RU", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Поле ответа */}
              <div className="border-t border-zinc-100 p-2 flex items-end gap-2 bg-white">
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleReply();
                    }
                  }}
                  rows={1}
                  placeholder={
                    selected.operatorTakeoverAt
                      ? "Введи сообщение и Enter…"
                      : "Возьми диалог чтобы отвечать вручную"
                  }
                  disabled={!selected.operatorTakeoverAt || sending}
                  className="flex-1 resize-none border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-zinc-50 disabled:text-zinc-400"
                />
                <Button
                  size="sm"
                  onClick={handleReply}
                  disabled={
                    !selected.operatorTakeoverAt ||
                    sending ||
                    !replyText.trim()
                  }
                >
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-zinc-400">
              <Users className="h-12 w-12" strokeWidth={1.2} />
              <p className="text-sm">Выбери подписчика слева</p>
              <p className="text-xs">
                <MessageSquare className="inline h-3 w-3 mr-1" />
                Активные диалоги доступны в табе «Inbox»
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
