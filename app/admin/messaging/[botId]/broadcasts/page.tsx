"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Send, Plus, Trash2, Clock, CheckCircle, XCircle, Loader2, X, AlertTriangle } from "lucide-react";

interface Broadcast {
  id: string;
  name: string;
  text: string;
  status: "draft" | "scheduled" | "sending" | "completed" | "cancelled" | "failed";
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  lastError: string | null;
  createdAt: string;
}

const STATUS_CONFIG: Record<Broadcast["status"], { label: string; color: string; icon: any }> = {
  draft: { label: "Черновик", color: "bg-gray-100 text-gray-600 border-gray-200", icon: Clock },
  scheduled: { label: "Запланирована", color: "bg-blue-50 text-blue-700 border-blue-200", icon: Clock },
  sending: { label: "Отправляется", color: "bg-amber-50 text-amber-700 border-amber-200", icon: Loader2 },
  completed: { label: "Отправлена", color: "bg-green-50 text-green-700 border-green-200", icon: CheckCircle },
  cancelled: { label: "Отменена", color: "bg-gray-100 text-gray-500 border-gray-200", icon: XCircle },
  failed: { label: "Ошибка", color: "bg-red-50 text-red-700 border-red-200", icon: AlertTriangle },
};

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function BroadcastsPage() {
  const { botId } = useParams<{ botId: string }>();
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const load = () => {
    setLoading(true);
    fetch(`/api/admin/messaging/bots/${botId}/broadcasts`)
      .then((r) => r.json())
      .then((d) => setBroadcasts(d.data ?? []))
      .finally(() => setLoading(false));
  };

  useEffect(load, [botId]);

  // Авто-обновление каждые 5с пока есть sending broadcast'ы
  useEffect(() => {
    const hasActive = broadcasts.some((b) => b.status === "sending");
    if (!hasActive) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [broadcasts]);

  const handleSend = async (id: string) => {
    if (!confirm("Запустить рассылку сейчас?")) return;
    const res = await fetch(`/api/admin/messaging/broadcasts/${id}/send`, { method: "POST" });
    if (res.ok) load();
    else {
      const data = await res.json();
      alert(data.error ?? "Ошибка");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Удалить рассылку?")) return;
    await fetch(`/api/admin/messaging/broadcasts/${id}`, { method: "DELETE" });
    load();
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <Link
        href={`/admin/messaging/${botId}/flows`}
        className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> К воронкам
      </Link>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Send className="w-6 h-6 text-blue-500" /> Рассылки
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Массовые сообщения по сегментам подписчиков
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg"
        >
          <Plus className="w-4 h-4" /> Создать рассылку
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Загрузка…</div>
      ) : broadcasts.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-400 text-sm">
          Рассылок пока нет
        </div>
      ) : (
        <div className="space-y-2">
          {broadcasts.map((b) => {
            const cfg = STATUS_CONFIG[b.status];
            const Icon = cfg.icon;
            const progress =
              b.totalRecipients > 0
                ? Math.round(((b.sentCount + b.failedCount) / b.totalRecipients) * 100)
                : 0;
            return (
              <div key={b.id} className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full border ${cfg.color}`}
                      >
                        <Icon className={`w-3 h-3 ${b.status === "sending" ? "animate-spin" : ""}`} />{" "}
                        {cfg.label}
                      </span>
                      <span className="font-medium text-gray-900">{b.name}</span>
                    </div>
                    <div className="text-xs text-gray-500 line-clamp-2 mb-1">{b.text}</div>
                    <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                      <span>
                        Получателей: <strong>{b.totalRecipients}</strong>
                      </span>
                      {(b.status === "sending" || b.status === "completed") && (
                        <span>
                          Отправлено: <strong className="text-green-600">{b.sentCount}</strong>
                          {b.failedCount > 0 && (
                            <span> · ошибок: <strong className="text-red-600">{b.failedCount}</strong></span>
                          )}
                        </span>
                      )}
                      {b.scheduledAt && b.status === "scheduled" && (
                        <span>Старт: {formatDate(b.scheduledAt)}</span>
                      )}
                      {b.completedAt && (
                        <span>Завершено: {formatDate(b.completedAt)}</span>
                      )}
                    </div>
                    {b.status === "sending" && (
                      <div className="mt-2 h-1 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-500 transition-all"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    )}
                    {b.lastError && (
                      <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                        {b.lastError}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {(b.status === "draft" || b.status === "scheduled") && (
                      <button
                        onClick={() => handleSend(b.id)}
                        className="px-2.5 py-1 text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg flex items-center gap-1"
                      >
                        <Send className="w-3 h-3" /> Отправить сейчас
                      </button>
                    )}
                    {b.status !== "sending" && (
                      <button
                        onClick={() => handleDelete(b.id)}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showCreate && (
        <CreateBroadcastModal
          botId={botId}
          onClose={() => setShowCreate(false)}
          onDone={() => {
            setShowCreate(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function CreateBroadcastModal({
  botId,
  onClose,
  onDone,
}: {
  botId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [tagsRaw, setTagsRaw] = useState("");
  const [excludeTagsRaw, setExcludeTagsRaw] = useState("");
  const [scheduleLater, setScheduleLater] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    setSaving(true);
    const body: any = {
      name: name.trim(),
      text: text.trim(),
      filter: {
        tags: tagsRaw.split(",").map((s) => s.trim()).filter(Boolean),
        excludeTags: excludeTagsRaw.split(",").map((s) => s.trim()).filter(Boolean),
      },
    };
    if (scheduleLater && scheduledAt) {
      body.scheduledAt = new Date(scheduledAt).toISOString();
    }
    const res = await fetch(`/api/admin/messaging/bots/${botId}/broadcasts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (res.ok) onDone();
    else {
      const data = await res.json();
      alert(data.error ?? "Ошибка");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-bold text-gray-900">Новая рассылка</h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-3 text-sm">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Название (только для админки)</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Текст сообщения (поддерживает шаблоны {`{{subscriber.firstName}}`})
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder={"Привет, {{subscriber.firstName}}!\n\nУ нас новость…"}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Включить теги (через запятую)
              </label>
              <input
                value={tagsRaw}
                onChange={(e) => setTagsRaw(e.target.value)}
                placeholder="vip, paid"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Исключить теги
              </label>
              <input
                value={excludeTagsRaw}
                onChange={(e) => setExcludeTagsRaw(e.target.value)}
                placeholder="unsubscribed"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={scheduleLater}
              onChange={(e) => setScheduleLater(e.target.checked)}
            />
            <span>Запланировать на конкретное время</span>
          </label>
          {scheduleLater && (
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
            />
          )}

          <p className="text-xs text-gray-400">
            Пустые теги = все подписчики. Можно отправить сейчас (создастся как draft, потом
            «Отправить сейчас») или запланировать (cron подберёт в нужное время).
          </p>
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">
            Отмена
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !name.trim() || !text.trim()}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Создать
          </button>
        </div>
      </div>
    </div>
  );
}
