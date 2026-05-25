"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Instagram, MessageSquare, Plus, RefreshCw, Trash2, AlertTriangle, CheckCircle, Users, GitBranch, Power, X } from "lucide-react";

interface MessagingBot {
  id: string;
  channel: "telegram" | "instagram" | "max";
  externalAccountId: string;
  title: string;
  isActive: boolean;
  tokenExpiresAt: string | null;
  meta: any;
  createdAt: string;
  _count: { subscribers: number };
}

const CHANNEL_CONFIG: Record<
  MessagingBot["channel"],
  { label: string; icon: typeof Instagram; color: string; gradient: string }
> = {
  instagram: {
    label: "Instagram",
    icon: Instagram,
    color: "text-pink-500",
    gradient: "from-purple-500 via-pink-500 to-orange-500",
  },
  max: { label: "МАКС", icon: MessageSquare, color: "text-blue-500", gradient: "from-blue-400 to-blue-600" },
  telegram: { label: "Telegram", icon: MessageSquare, color: "text-sky-500", gradient: "from-sky-400 to-sky-600" },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function tokenExpiryStatus(expiresAt: string | null): { label: string; color: string } | null {
  if (!expiresAt) return null;
  const days = Math.floor((new Date(expiresAt).getTime() - Date.now()) / (24 * 3600 * 1000));
  if (days < 0) return { label: "Истёк", color: "text-red-500" };
  if (days < 7) return { label: `Истечёт через ${days} дн.`, color: "text-orange-500" };
  return { label: `${days} дн. до обновления`, color: "text-gray-400" };
}

export default function MessagingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [bots, setBots] = useState<MessagingBot[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [toast, setToast] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  // ── Прочитать query params после возврата с OAuth callback ──────────────
  useEffect(() => {
    const connected = searchParams.get("ig_connected");
    const error = searchParams.get("ig_error");
    if (connected) {
      setToast({ kind: "success", text: `Instagram-аккаунт @${connected} подключён` });
      // чистим query
      router.replace("/admin/messaging");
    } else if (error) {
      setToast({ kind: "error", text: `Ошибка подключения: ${error}` });
      router.replace("/admin/messaging");
    }
  }, [searchParams, router]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 7000);
    return () => clearTimeout(t);
  }, [toast]);

  const load = () => {
    setLoading(true);
    fetch("/api/admin/messaging/bots")
      .then((r) => r.json())
      .then((d) => setBots(d.data ?? []))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleConnectInstagram = async () => {
    setConnecting(true);
    try {
      const res = await fetch("/api/messaging/instagram/oauth/start");
      const data = await res.json();
      if (!res.ok || !data.success) {
        setToast({ kind: "error", text: data.error ?? "Не удалось начать OAuth" });
        return;
      }
      window.location.href = data.data.url;
    } catch {
      setToast({ kind: "error", text: "Ошибка сети" });
    } finally {
      setConnecting(false);
    }
  };

  // Модальное окно подтверждения удаления
  const [confirmDelete, setConfirmDelete] = useState<MessagingBot | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDisable = async (bot: MessagingBot) => {
    if (!confirm(`Отключить ${CHANNEL_CONFIG[bot.channel].label} «${bot.title}»? Можно будет переподключить позже.`)) return;
    const res = await fetch(`/api/admin/messaging/bots/${bot.id}?mode=disable`, { method: "DELETE" });
    if (res.ok) {
      setToast({ kind: "success", text: `${CHANNEL_CONFIG[bot.channel].label} отключён` });
      load();
    } else {
      setToast({ kind: "error", text: "Не удалось отключить" });
    }
  };

  const handleHardDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/messaging/bots/${confirmDelete.id}?mode=delete`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const wh = data.webhookUnsubscribed ? "" : " (webhook не отписан — токен мог истечь)";
        setToast({
          kind: "success",
          text: `${CHANNEL_CONFIG[confirmDelete.channel].label} «${confirmDelete.title}» удалён${wh}`,
        });
        setConfirmDelete(null);
        load();
      } else {
        setToast({ kind: "error", text: data.error ?? "Не удалось удалить" });
      }
    } catch {
      setToast({ kind: "error", text: "Ошибка сети" });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Toast */}
      {toast && (
        <div
          className={`mb-4 p-3 rounded-lg flex items-center gap-2 text-sm ${
            toast.kind === "success"
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {toast.kind === "success" ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {toast.text}
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Каналы общения</h1>
          <p className="text-sm text-gray-500 mt-0.5">Instagram, МАКС и другие каналы кроме Telegram</p>
        </div>
        <button onClick={load} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Кнопки подключения */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
        <button
          onClick={handleConnectInstagram}
          disabled={connecting}
          className="group relative p-5 bg-white border border-gray-200 hover:border-pink-400 rounded-xl transition-all overflow-hidden disabled:opacity-50"
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 flex items-center justify-center text-white">
              <Instagram className="w-6 h-6" />
            </div>
            <div className="text-left">
              <div className="font-semibold text-gray-900">{connecting ? "Подключаем..." : "Подключить Instagram"}</div>
              <div className="text-xs text-gray-500">Через Meta OAuth — нужен Business-аккаунт</div>
            </div>
            <Plus className="w-5 h-5 text-gray-300 group-hover:text-pink-400 ml-auto transition-colors" />
          </div>
        </button>

        <button
          disabled
          className="p-5 bg-white border border-gray-200 rounded-xl opacity-50 cursor-not-allowed"
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white">
              <MessageSquare className="w-6 h-6" />
            </div>
            <div className="text-left">
              <div className="font-semibold text-gray-900">Подключить МАКС</div>
              <div className="text-xs text-gray-500">Скоро</div>
            </div>
          </div>
        </button>
      </div>

      {/* Подсказка для Instagram */}
      <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-900">
        <p className="font-semibold mb-2">🛠 Прежде чем подключать Instagram:</p>
        <ol className="list-decimal list-inside space-y-1 text-blue-800">
          <li>Аккаунт Instagram должен быть переведён в <strong>Business</strong> (не Creator, не Personal)</li>
          <li>В Instagram включить: <em>Настройки → Конфиденциальность → Сообщения → Разрешить доступ к сообщениям</em></li>
          <li>В период App Review Meta — работает только с тестовыми аккаунтами (добавь их как Tester в Meta Dev Console)</li>
        </ol>
      </div>

      {/* Список подключённых */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
          <h2 className="text-sm font-semibold text-gray-700">Подключённые аккаунты</h2>
        </div>
        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Загрузка…</div>
        ) : bots.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">Пока ничего не подключено</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {bots.map((bot) => {
              const cfg = CHANNEL_CONFIG[bot.channel];
              const Icon = cfg.icon;
              const expiry = tokenExpiryStatus(bot.tokenExpiresAt);

              return (
                <div key={bot.id} className="p-4 flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${cfg.gradient} flex items-center justify-center text-white shrink-0`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-900">{bot.title}</span>
                      <span className="text-xs text-gray-400">{cfg.label}</span>
                      {!bot.isActive && (
                        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">отключён</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      <span className="text-xs text-gray-500 flex items-center gap-1">
                        <Users className="w-3 h-3" /> {bot._count.subscribers} подписчиков
                      </span>
                      <span className="text-xs text-gray-400">{formatDate(bot.createdAt)}</span>
                      {expiry && <span className={`text-xs ${expiry.color}`}>{expiry.label}</span>}
                    </div>
                  </div>
                  <Link
                    href={`/admin/messaging/${bot.id}/flows`}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                  >
                    <GitBranch className="w-3 h-3" /> Воронки
                  </Link>
                  {bot.isActive && (
                    <button
                      onClick={() => handleDisable(bot)}
                      className="p-2 text-gray-400 hover:text-orange-500 hover:bg-orange-50 rounded-lg transition-colors"
                      title="Отключить (можно переподключить позже)"
                    >
                      <Power className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => setConfirmDelete(bot)}
                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    title="Удалить полностью"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Модалка подтверждения hard-delete */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 relative">
            <button
              onClick={() => setConfirmDelete(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <Trash2 className="w-6 h-6 text-red-500" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Удалить полностью?</h2>
                <p className="text-sm text-gray-500">{CHANNEL_CONFIG[confirmDelete.channel].label} «{confirmDelete.title}»</p>
              </div>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-800">
              <p className="font-semibold mb-1">⚠️ Это действие необратимо. Будут удалены:</p>
              <ul className="list-disc list-inside space-y-0.5 text-xs">
                <li>{confirmDelete._count.subscribers} подписчиков и их история</li>
                <li>Все воронки бота, их триггеры и запуски</li>
                <li>Подписка на webhook со стороны Meta будет отозвана</li>
              </ul>
              <p className="mt-2 text-xs">
                Если просто хочешь временно отключить — закрой и нажми <Power className="w-3 h-3 inline" /> вместо корзины.
              </p>
            </div>

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 border border-gray-200 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={handleHardDelete}
                disabled={deleting}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1"
              >
                <Trash2 className="w-4 h-4" />
                {deleting ? "Удаляю…" : "Удалить полностью"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
