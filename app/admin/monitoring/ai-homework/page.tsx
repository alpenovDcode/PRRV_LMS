"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  RefreshCw,
  Search,
  Clock,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Loader2,
  Send,
  RotateCcw,
  ExternalLink,
  X,
  Brain,
  PauseCircle,
} from "lucide-react";

type Category = "queued" | "in_progress" | "stuck" | "failed" | "completed";

interface AIItem {
  id: string;
  status: string;
  createdAt: string;
  reviewedAt: string | null;
  curatorComment: string | null;
  aiSuggestedVerdict: string | null;
  aiSuggestedComment: string | null;
  aiAnalyzedAt: string | null;
  aiAnalysisStartedAt: string | null;
  aiAnalysisError: string | null;
  user: { id: string; email: string; fullName: string | null };
  lesson: { id: string; title: string; aiPrompt: string | null } | null;
  category: Category;
  mode: "auto_approve" | "suggest";
  queueStatus: string | null;
  queueAttempts: number;
  queueCheckAfter: string | null;
  queueLastError: string | null;
}

const CATEGORY_CFG: Record<
  Category,
  { label: string; color: string; icon: any; description: string }
> = {
  queued: {
    label: "В очереди",
    color: "text-gray-600 bg-gray-100 border-gray-200",
    icon: PauseCircle,
    description: "Cron подберёт когда наступит время",
  },
  in_progress: {
    label: "Анализируется",
    color: "text-blue-700 bg-blue-50 border-blue-200",
    icon: Loader2,
    description: "Ждём callback от AI-checker",
  },
  stuck: {
    label: "Зависло",
    color: "text-orange-700 bg-orange-50 border-orange-200",
    icon: Clock,
    description: "Прошёл час, AI-checker не ответил",
  },
  failed: {
    label: "Ошибка",
    color: "text-red-700 bg-red-50 border-red-200",
    icon: XCircle,
    description: "AI-checker вернул ошибку",
  },
  completed: {
    label: "Готово",
    color: "text-green-700 bg-green-50 border-green-200",
    icon: CheckCircle,
    description: "Результат сохранён",
  },
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

function timeAgo(iso: string | null) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "только что";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} мин назад`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} ч назад`;
  return `${Math.floor(diff / 86_400_000)} дн назад`;
}

export default function AIHomeworkMonitoringPage() {
  const [items, setItems] = useState<AIItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Category | "all">("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState<{ total: number; pages: number }>({ total: 0, pages: 1 });
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Модалки
  const [manualTarget, setManualTarget] = useState<AIItem | null>(null);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    const qs = new URLSearchParams({ page: String(page), filter });
    if (search) qs.set("search", search);
    fetch(`/api/admin/monitoring/ai-homework?${qs}`)
      .then((r) => r.json())
      .then((d) => {
        setItems(d.data ?? []);
        setMeta(d.meta ?? { total: 0, pages: 1 });
      })
      .finally(() => setLoading(false));
  }, [page, filter, search]);

  useEffect(load, [load]);

  // Авто-обновление каждые 15 секунд (только когда autoRefresh включён)
  useEffect(() => {
    if (!autoRefresh) return;
    const i = setInterval(load, 15_000);
    return () => clearInterval(i);
  }, [autoRefresh, load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const handleRetry = async (item: AIItem) => {
    if (!confirm(`Перезапустить проверку для ДЗ "${item.lesson?.title ?? item.id}"?`)) return;
    const res = await fetch(`/api/admin/monitoring/ai-homework/${item.id}/retry`, {
      method: "POST",
    });
    const data = await res.json();
    if (res.ok && data.success) {
      setToast({
        kind: "ok",
        text: data.queueReactivated
          ? "Перезапущено — cron подберёт в течение минуты"
          : "Сброшено. Запусти проверку из карточки ДЗ.",
      });
      load();
    } else {
      setToast({ kind: "err", text: data.error ?? "Не удалось перезапустить" });
    }
  };

  // Подсчёт по категориям для тулбара (берём из ВСЕХ items в текущей странице
  // — приблизительно, для общей картинки используем total отдельным запросом
  // в будущем; сейчас простой UI).
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Brain className="w-6 h-6 text-blue-500" /> AI-проверки ДЗ
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Логи AI-проверок: что в очереди, что застряло, что упало. {meta.total} записей.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-gray-500">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Авто-обновление (15с)
          </label>
          <button
            onClick={load}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`p-3 rounded-lg text-sm border ${
            toast.kind === "ok"
              ? "bg-green-50 text-green-700 border-green-200"
              : "bg-red-50 text-red-700 border-red-200"
          }`}
        >
          {toast.text}
        </div>
      )}

      {/* Фильтры */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => { setFilter("all"); setPage(1); }}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
            filter === "all" ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
          }`}
        >
          Все
        </button>
        {(Object.keys(CATEGORY_CFG) as Category[]).map((cat) => {
          const cfg = CATEGORY_CFG[cat];
          const active = filter === cat;
          return (
            <button
              key={cat}
              onClick={() => { setFilter(cat); setPage(1); }}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                active ? cfg.color : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
              }`}
            >
              {cfg.label}
            </button>
          );
        })}
        <div className="ml-auto relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Email или имя…"
            className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>
      </div>

      {/* Список */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {loading && items.length === 0 ? (
          <div className="p-12 text-center text-gray-400 text-sm">Загрузка…</div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-gray-400 text-sm">Записей не найдено</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {items.map((item) => {
              const cfg = CATEGORY_CFG[item.category];
              const CatIcon = cfg.icon;
              return (
                <div key={item.id} className="p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start gap-4">
                    {/* Категория */}
                    <div className="shrink-0 pt-1">
                      <div className={`flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full border ${cfg.color}`}>
                        <CatIcon className={`w-3 h-3 ${item.category === "in_progress" ? "animate-spin" : ""}`} />
                        {cfg.label}
                      </div>
                    </div>

                    {/* Содержание */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <Link
                          href={`/admin/homework/${item.id}`}
                          className="font-medium text-gray-900 hover:text-blue-600 transition-colors"
                        >
                          {item.lesson?.title ?? "—"}
                        </Link>
                        <span className="text-xs text-gray-400">·</span>
                        <span className="text-xs text-gray-600">
                          {item.user.fullName ?? item.user.email}
                        </span>
                        <span className="text-xs text-gray-400">{item.user.email}</span>
                        <span
                          className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                            item.mode === "auto_approve"
                              ? "bg-purple-50 text-purple-700"
                              : "bg-amber-50 text-amber-700"
                          }`}
                        >
                          {item.mode === "auto_approve" ? "auto" : "suggest"}
                        </span>
                      </div>

                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
                        <span>Создано: {timeAgo(item.createdAt)}</span>
                        {item.aiAnalysisStartedAt && (
                          <span>Запущено: {timeAgo(item.aiAnalysisStartedAt)}</span>
                        )}
                        {item.aiAnalyzedAt && (
                          <span>Готово: {timeAgo(item.aiAnalyzedAt)}</span>
                        )}
                        {item.queueAttempts > 0 && (
                          <span>Попыток: {item.queueAttempts}</span>
                        )}
                        {item.queueCheckAfter && item.category === "queued" && (
                          <span>След. проверка: {formatDate(item.queueCheckAfter)}</span>
                        )}
                      </div>

                      {/* Ошибка */}
                      {item.aiAnalysisError && (
                        <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                          <strong>Ошибка:</strong> {item.aiAnalysisError}
                        </div>
                      )}
                      {!item.aiAnalysisError && item.queueLastError && (
                        <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                          <strong>Последняя ошибка cron:</strong> {item.queueLastError}
                        </div>
                      )}

                      {/* Результат (если есть) */}
                      {item.aiSuggestedVerdict && (
                        <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded-lg text-xs">
                          <div className="font-medium text-blue-900 mb-0.5">
                            AI suggest: {item.aiSuggestedVerdict === "approved" ? "✓ Одобрить" : "✗ Отклонить"}
                          </div>
                          <div className="text-blue-700 line-clamp-2">{item.aiSuggestedComment}</div>
                        </div>
                      )}
                      {item.curatorComment && item.status !== "pending" && (
                        <div className="mt-2 p-2 bg-gray-50 border border-gray-200 rounded-lg text-xs">
                          <div className="font-medium text-gray-900 mb-0.5">
                            Итог: {item.status === "approved" ? "✓ Одобрено" : "✗ Отклонено"}
                          </div>
                          <div className="text-gray-600 line-clamp-2">{item.curatorComment}</div>
                        </div>
                      )}
                    </div>

                    {/* Действия */}
                    <div className="shrink-0 flex flex-col gap-1">
                      <Link
                        href={`/admin/homework/${item.id}`}
                        className="flex items-center gap-1 text-xs text-gray-600 hover:text-blue-600 hover:bg-blue-50 px-2 py-1 rounded transition-colors"
                      >
                        <ExternalLink className="w-3 h-3" /> Открыть
                      </Link>
                      {item.category !== "completed" && (
                        <button
                          onClick={() => handleRetry(item)}
                          className="flex items-center gap-1 text-xs text-gray-600 hover:text-blue-600 hover:bg-blue-50 px-2 py-1 rounded transition-colors"
                        >
                          <RotateCcw className="w-3 h-3" /> Перезапустить
                        </button>
                      )}
                      {item.category !== "completed" && (
                        <button
                          onClick={() => setManualTarget(item)}
                          className="flex items-center gap-1 text-xs text-amber-700 hover:bg-amber-50 px-2 py-1 rounded transition-colors"
                        >
                          <Send className="w-3 h-3" /> Ответить вручную
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Пагинация */}
      {meta.pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm disabled:opacity-40 hover:bg-gray-50"
          >
            ← Назад
          </button>
          <span className="text-sm text-gray-500">стр. {page} / {meta.pages}</span>
          <button
            disabled={page >= meta.pages}
            onClick={() => setPage(page + 1)}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm disabled:opacity-40 hover:bg-gray-50"
          >
            Вперёд →
          </button>
        </div>
      )}

      {/* Модалка ручного ввода результата */}
      {manualTarget && (
        <ManualResultModal
          item={manualTarget}
          onClose={() => setManualTarget(null)}
          onDone={(msg) => {
            setManualTarget(null);
            setToast({ kind: "ok", text: msg });
            load();
          }}
          onError={(msg) => setToast({ kind: "err", text: msg })}
        />
      )}
    </div>
  );
}

// ─── Модалка ручного ответа ────────────────────────────────────────────────

function ManualResultModal({
  item,
  onClose,
  onDone,
  onError,
}: {
  item: AIItem;
  onClose: () => void;
  onDone: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [verdict, setVerdict] = useState<"approved" | "rejected">("approved");
  const [comment, setComment] = useState(item.aiSuggestedComment ?? "");
  const [mode, setMode] = useState<"auto_approve" | "suggest">(item.mode);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!comment.trim()) {
      onError("Комментарий обязателен");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/monitoring/ai-homework/${item.id}/manual-result`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verdict, comment, mode }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        onDone(
          mode === "auto_approve"
            ? `Статус ДЗ выставлен: ${verdict === "approved" ? "одобрено" : "отклонено"}`
            : "AI-suggest записан, куратор увидит в карточке ДЗ"
        );
      } else {
        onError(data.error ?? "Не удалось сохранить");
      }
    } catch {
      onError("Ошибка сети");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-gray-900">Ответ на ДЗ вручную</h2>
            <p className="text-xs text-gray-500 mt-0.5">{item.lesson?.title}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
              Режим
            </label>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as any)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="auto_approve">Финальный статус (студент увидит сразу)</option>
              <option value="suggest">AI-предложение (куратор решит сам)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
              Вердикт
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setVerdict("approved")}
                className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                  verdict === "approved"
                    ? "bg-green-50 text-green-700 border-green-300"
                    : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                }`}
              >
                <CheckCircle className="w-4 h-4" /> Одобрить
              </button>
              <button
                onClick={() => setVerdict("rejected")}
                className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                  verdict === "rejected"
                    ? "bg-red-50 text-red-700 border-red-300"
                    : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                }`}
              >
                <XCircle className="w-4 h-4" /> Отклонить
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
              Комментарий
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={6}
              maxLength={5000}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-y"
              placeholder="Текст ответа от AI-checker'а — что он насчитал по этому ДЗ"
            />
            <p className="text-[10px] text-gray-400 mt-1">{comment.length} / 5000</p>
          </div>

          {mode === "auto_approve" && item.status !== "pending" && (
            <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
              ⚠️ ДЗ уже в статусе «{item.status}» — режим auto_approve будет отклонён (409).
              Используй режим suggest или пересмотри в карточке ДЗ.
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm font-medium border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Отмена
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !comment.trim()}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
            {saving ? "Сохраняю…" : "Отправить ответ"}
          </button>
        </div>
      </div>
    </div>
  );
}
