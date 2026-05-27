"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Send, Hand, Bot, MessageSquare, Loader2, RefreshCw } from "lucide-react";

interface Subscriber {
  id: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  externalUserId: string;
  tags: string[];
  operatorTakeoverAt: string | null;
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

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export default function InboxPage() {
  const { botId } = useParams<{ botId: string }>();
  const [dialogs, setDialogs] = useState<Dialog[]>([]);
  const [selected, setSelected] = useState<Dialog | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingD, setLoadingD] = useState(true);
  const [loadingM, setLoadingM] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
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

  useEffect(loadDialogs, [botId]);

  // Авто-обновление каждые 10с
  useEffect(() => {
    const t = setInterval(() => {
      loadDialogs();
      if (selected) loadMessages(selected.subscriberId);
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
    loadMessages(d.subscriberId);
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
      // Обновляем selected — refetch
      const fresh = await fetch(`/api/admin/messaging/bots/${botId}/inbox`).then((r) => r.json());
      const updated = (fresh.data ?? []).find((d: Dialog) => d.subscriberId === selected.subscriberId);
      if (updated) setSelected(updated);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
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

      <div className="grid grid-cols-12 gap-4 h-[calc(100vh-220px)] min-h-[500px]">
        {/* Список диалогов */}
        <div className="col-span-4 bg-white border border-gray-200 rounded-xl overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Диалоги ({dialogs.length})
          </div>
          <div className="overflow-y-auto flex-1">
            {loadingD && dialogs.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">Загрузка…</div>
            ) : dialogs.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">Сообщений пока нет</div>
            ) : (
              dialogs.map((d) => (
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
                  <div className="text-xs text-gray-500 line-clamp-2">
                    {d.lastMessage.direction === "out" && (
                      <span className="text-gray-400">→ </span>
                    )}
                    {d.lastMessage.text || <em className="text-gray-400">медиа</em>}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Окно диалога */}
        <div className="col-span-8 bg-white border border-gray-200 rounded-xl overflow-hidden flex flex-col">
          {!selected ? (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
              Выбери диалог слева
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                <div>
                  <div className="font-semibold text-gray-900">{getName(selected.subscriber)}</div>
                  <div className="text-xs text-gray-500">
                    {selected.subscriber.tags.length > 0 && (
                      <span>Теги: {selected.subscriber.tags.join(", ")}</span>
                    )}
                  </div>
                </div>
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
                        className={`max-w-[70%] rounded-2xl px-3 py-2 ${
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
                          <div className="text-xs font-mono opacity-70">
                            payload: {m.callbackPayload}
                          </div>
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
      </div>
    </div>
  );
}
