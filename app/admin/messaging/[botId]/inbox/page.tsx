"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Send,
  Hand,
  Bot,
  MessageSquare,
  Loader2,
  RefreshCw,
  Search,
  X,
  Plus,
} from "lucide-react";

interface Subscriber {
  id: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  externalUserId: string;
  tags: string[];
  operatorTakeoverAt: string | null;
}

interface SubscriberDetail extends Subscriber {
  variables: Record<string, unknown>;
  subscribedAt: string;
  lastInboundAt: string | null;
  lastSeenAt: string | null;
  channel: "telegram" | "instagram" | "max";
}

interface Dialog {
  subscriberId: string;
  subscriber: Subscriber;
  lastMessage: { text: string | null; direction: string; createdAt: string };
}

interface Message {
  id: string;
  direction: "in" | "out";
  text: string | null;
  callbackPayload: string | null;
  source: string | null;
  createdAt: string;
}

function getName(s: Subscriber) {
  return [s.firstName, s.lastName].filter(Boolean).join(" ") || s.username || s.externalUserId;
}

function initial(s: Subscriber) {
  return (getName(s).trim()[0] ?? "?").toUpperCase();
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "только что";
  if (min < 60) return `${min} мин назад`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} ч назад`;
  const d = Math.floor(h / 24);
  return `${d} дн назад`;
}

const CHANNEL_LABEL: Record<string, string> = {
  telegram: "Telegram",
  instagram: "Instagram",
  max: "MAX",
};

export default function InboxPage() {
  const { botId } = useParams<{ botId: string }>();
  const [dialogs, setDialogs] = useState<Dialog[]>([]);
  const [selected, setSelected] = useState<Dialog | null>(null);
  const [detail, setDetail] = useState<SubscriberDetail | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingD, setLoadingD] = useState(true);
  const [loadingM, setLoadingM] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState("");
  const [newTag, setNewTag] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadDialogs = () => {
    setLoadingD(true);
    fetch(`/api/admin/messaging/bots/${botId}/inbox`)
      .then((r) => r.json())
      .then((d) => setDialogs(d.data ?? []))
      .finally(() => setLoadingD(false));
  };

  const loadMessages = (subId: string) => {
    setLoadingM(true);
    fetch(`/api/admin/messaging/subscribers/${subId}/messages`)
      .then((r) => r.json())
      .then((d) => setMessages(d.data ?? []))
      .finally(() => setLoadingM(false));
  };

  const loadDetail = (subId: string) => {
    fetch(`/api/admin/messaging/subscribers/${subId}`)
      .then((r) => r.json())
      .then((d) => setDetail(d.success ? d.data : null));
  };

  useEffect(loadDialogs, [botId]);

  // Авто-обновление каждые 10с
  useEffect(() => {
    const t = setInterval(() => {
      loadDialogs();
      if (selected) {
        loadMessages(selected.subscriberId);
        loadDetail(selected.subscriberId);
      }
    }, 10_000);
    return () => clearInterval(t);
  }, [selected]);

  // Авто-скролл вниз при появлении новых сообщений
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSelect = (d: Dialog) => {
    setSelected(d);
    setDetail(null);
    loadMessages(d.subscriberId);
    loadDetail(d.subscriberId);
  };

  const handleReply = async () => {
    if (!selected || !replyText.trim()) return;
    setSending(true);
    try {
      const res = await fetch(
        `/api/admin/messaging/subscribers/${selected.subscriberId}/reply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: replyText.trim() }),
        }
      );
      const data = await res.json();
      if (res.ok && data.success) {
        setReplyText("");
        loadMessages(selected.subscriberId);
        loadDialogs();
      } else {
        alert(data.error ?? "Не удалось отправить");
      }
    } finally {
      setSending(false);
    }
  };

  const handleTakeover = async () => {
    if (!selected) return;
    const isTakingOver = !selected.subscriber.operatorTakeoverAt;
    const res = await fetch(
      `/api/admin/messaging/subscribers/${selected.subscriberId}/takeover`,
      { method: isTakingOver ? "POST" : "DELETE" }
    );
    if (res.ok) {
      loadDialogs();
      loadMessages(selected.subscriberId);
      const fresh = await fetch(`/api/admin/messaging/bots/${botId}/inbox`).then((r) => r.json());
      const updated = (fresh.data ?? []).find((d: Dialog) => d.subscriberId === selected.subscriberId);
      if (updated) setSelected(updated);
      loadDetail(selected.subscriberId);
    }
  };

  const addTag = async (tag: string) => {
    if (!selected || !tag.trim()) return;
    const res = await fetch(
      `/api/admin/messaging/subscribers/${selected.subscriberId}/tags`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tag: tag.trim() }),
      }
    );
    const data = await res.json();
    if (res.ok && data.success) {
      setNewTag("");
      setDetail((d) => (d ? { ...d, tags: data.data.tags } : d));
      loadDialogs();
    }
  };

  const removeTag = async (tag: string) => {
    if (!selected) return;
    const res = await fetch(
      `/api/admin/messaging/subscribers/${selected.subscriberId}/tags`,
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tag }),
      }
    );
    const data = await res.json();
    if (res.ok && data.success) {
      setDetail((d) => (d ? { ...d, tags: data.data.tags } : d));
      loadDialogs();
    }
  };

  const filteredDialogs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return dialogs;
    return dialogs.filter((d) => {
      const s = d.subscriber;
      return (
        getName(s).toLowerCase().includes(q) ||
        (s.username ?? "").toLowerCase().includes(q) ||
        s.externalUserId.toLowerCase().includes(q)
      );
    });
  }, [dialogs, search]);

  // Переменные без служебных ключей (начинающихся с _).
  const visibleVars = useMemo(() => {
    if (!detail) return [] as [string, unknown][];
    return Object.entries(detail.variables ?? {}).filter(([k]) => !k.startsWith("_"));
  }, [detail]);

  return (
    <div className="p-6 max-w-[1500px] mx-auto">
      <Link
        href={`/admin/messaging/${botId}/flows`}
        className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> К воронкам
      </Link>

      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <MessageSquare className="w-6 h-6 text-blue-500" /> Inbox
        </h1>
        <button onClick={loadDialogs} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
          <RefreshCw className={`w-4 h-4 ${loadingD ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="grid grid-cols-12 gap-4 h-[calc(100vh-200px)] min-h-[520px]">
        {/* Список диалогов */}
        <div className="col-span-3 bg-white border border-gray-200 rounded-xl overflow-hidden flex flex-col">
          <div className="px-3 py-2.5 border-b border-gray-100 bg-gray-50">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Диалоги ({filteredDialogs.length})
            </div>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Поиск по имени, @username, id"
                className="w-full pl-8 pr-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>
          <div className="overflow-y-auto flex-1">
            {loadingD && dialogs.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">Загрузка…</div>
            ) : filteredDialogs.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">
                {search ? "Ничего не найдено" : "Сообщений пока нет"}
              </div>
            ) : (
              filteredDialogs.map((d) => (
                <button
                  key={d.subscriberId}
                  onClick={() => handleSelect(d)}
                  className={`w-full text-left p-3 border-b border-gray-100 transition-colors ${
                    selected?.subscriberId === d.subscriberId
                      ? "bg-blue-50 border-l-4 border-l-blue-500"
                      : "hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 text-white flex items-center justify-center text-xs font-semibold shrink-0">
                      {initial(d.subscriber)}
                    </div>
                    <div className="font-medium text-sm text-gray-900 truncate flex-1">
                      {getName(d.subscriber)}
                    </div>
                    {d.subscriber.operatorTakeoverAt && (
                      <Hand className="w-3 h-3 text-amber-500" />
                    )}
                    <span className="text-[10px] text-gray-400 whitespace-nowrap">
                      {formatTime(d.lastMessage.createdAt)}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 line-clamp-1 pl-9">
                    {d.lastMessage.direction === "out" && <span className="text-gray-400">→ </span>}
                    {d.lastMessage.text || <em className="text-gray-400">медиа</em>}
                  </div>
                  {d.subscriber.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5 pl-9">
                      {d.subscriber.tags.slice(0, 3).map((t) => (
                        <span key={t} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                          {t}
                        </span>
                      ))}
                      {d.subscriber.tags.length > 3 && (
                        <span className="text-[10px] text-gray-400">+{d.subscriber.tags.length - 3}</span>
                      )}
                    </div>
                  )}
                </button>
              ))
            )}
          </div>
        </div>

        {/* Окно диалога */}
        <div className="col-span-6 bg-white border border-gray-200 rounded-xl overflow-hidden flex flex-col">
          {!selected ? (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
              Выбери диалог слева
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                <div className="font-semibold text-gray-900">{getName(selected.subscriber)}</div>
                <button
                  onClick={handleTakeover}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                    selected.subscriber.operatorTakeoverAt
                      ? "bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100"
                      : "bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100"
                  }`}
                >
                  {selected.subscriber.operatorTakeoverAt ? (
                    <>
                      <Bot className="w-3.5 h-3.5" /> Вернуть боту
                    </>
                  ) : (
                    <>
                      <Hand className="w-3.5 h-3.5" /> Взять диалог
                    </>
                  )}
                </button>
              </div>

              {/* Сообщения */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2 bg-gray-50">
                {loadingM && messages.length === 0 ? (
                  <div className="text-center text-gray-400 text-sm">Загрузка…</div>
                ) : (
                  messages.map((m) => (
                    <div
                      key={m.id}
                      className={`flex ${m.direction === "out" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[75%] rounded-2xl px-3 py-2 ${
                          m.direction === "out"
                            ? m.source?.startsWith("operator:")
                              ? "bg-amber-100 text-amber-900"
                              : "bg-blue-500 text-white"
                            : "bg-white border border-gray-200 text-gray-900"
                        }`}
                      >
                        {m.text && (
                          <div className="text-sm whitespace-pre-wrap break-words">{m.text}</div>
                        )}
                        {m.callbackPayload && (
                          <div className="text-xs font-mono opacity-70">payload: {m.callbackPayload}</div>
                        )}
                        <div
                          className={`text-[10px] mt-1 ${
                            m.direction === "out" && !m.source?.startsWith("operator:")
                              ? "text-blue-100"
                              : "text-gray-400"
                          }`}
                        >
                          {formatTime(m.createdAt)}
                          {m.source?.startsWith("operator:") && " · оператор"}
                          {m.source === "flow" && " · бот"}
                          {m.source === "broadcast" && " · рассылка"}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Reply */}
              <div className="p-3 border-t border-gray-100 flex gap-2">
                <input
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleReply();
                    }
                  }}
                  placeholder="Написать сообщение…"
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <button
                  onClick={handleReply}
                  disabled={sending || !replyText.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
                >
                  {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Панель профиля */}
        <div className="col-span-3 bg-white border border-gray-200 rounded-xl overflow-hidden flex flex-col">
          {!selected ? (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-xs px-4 text-center">
              Профиль появится при выборе диалога
            </div>
          ) : (
            <div className="overflow-y-auto flex-1 p-4 space-y-5">
              {/* Шапка профиля */}
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 text-white flex items-center justify-center text-2xl font-semibold mb-2">
                  {initial(selected.subscriber)}
                </div>
                <div className="font-semibold text-gray-900">{getName(selected.subscriber)}</div>
                {selected.subscriber.username && (
                  <div className="text-sm text-gray-400">@{selected.subscriber.username}</div>
                )}
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[11px] bg-green-50 text-green-700 px-2 py-0.5 rounded-full">
                    {detail ? CHANNEL_LABEL[detail.channel] ?? detail.channel : "—"}
                  </span>
                  {detail && (
                    <span className="text-[11px] text-gray-400">
                      активен {relativeTime(detail.lastSeenAt ?? detail.lastInboundAt)}
                    </span>
                  )}
                </div>
              </div>

              {/* Идентификатор + даты */}
              <div className="text-xs text-gray-500 space-y-1 border-t border-gray-100 pt-3">
                <div className="flex justify-between gap-2">
                  <span className="text-gray-400">ID</span>
                  <span className="font-mono text-gray-600 truncate">{selected.subscriber.externalUserId}</span>
                </div>
                {detail && (
                  <>
                    <div className="flex justify-between gap-2">
                      <span className="text-gray-400">Подписан</span>
                      <span className="text-gray-600">{formatDate(detail.subscribedAt)}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-gray-400">Последний вход</span>
                      <span className="text-gray-600">{relativeTime(detail.lastInboundAt)}</span>
                    </div>
                  </>
                )}
              </div>

              {/* Теги */}
              <div className="border-t border-gray-100 pt-3">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Теги</div>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {(detail?.tags ?? selected.subscriber.tags).map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-md"
                    >
                      {t}
                      <button onClick={() => removeTag(t)} className="hover:text-blue-900">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  {(detail?.tags ?? selected.subscriber.tags).length === 0 && (
                    <span className="text-xs text-gray-400">Тегов пока нет</span>
                  )}
                </div>
                <div className="flex gap-1.5">
                  <input
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addTag(newTag);
                      }
                    }}
                    placeholder="новый тег"
                    className="flex-1 border border-gray-200 rounded-md px-2 py-1 text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                  <button
                    onClick={() => addTag(newTag)}
                    disabled={!newTag.trim()}
                    className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-md disabled:opacity-50"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Переменные */}
              <div className="border-t border-gray-100 pt-3">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Переменные</div>
                {visibleVars.length === 0 ? (
                  <span className="text-xs text-gray-400">Переменных пока нет</span>
                ) : (
                  <div className="space-y-1.5">
                    {visibleVars.map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-2 text-xs">
                        <span className="text-gray-400 truncate">{k}</span>
                        <span className="text-gray-700 font-medium truncate max-w-[55%] text-right">
                          {v === null || v === undefined ? "—" : String(v)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
