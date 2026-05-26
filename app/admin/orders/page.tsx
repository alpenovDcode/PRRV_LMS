"use client";

import { useEffect, useState, useCallback } from "react";
import { Search, RefreshCw, CheckCircle, Clock, XCircle, RotateCcw, Filter, X, AlertTriangle, Loader2 } from "lucide-react";

interface Order {
  id: string;
  status: string;
  amount: string;
  currency: string;
  paymentMethod: string | null;
  paidAt: string | null;
  createdAt: string;
  user: { id: string; email: string; fullName: string | null };
  offer: { id: string; title: string };
}

interface Meta { total: number; page: number; pages: number; }

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  pending:             { label: "Ожидает",    color: "text-yellow-600 bg-yellow-50 border-yellow-200", icon: Clock },
  waiting_for_capture: { label: "Холд",       color: "text-blue-600   bg-blue-50   border-blue-200",   icon: Clock },
  paid:                { label: "Оплачен",    color: "text-green-600  bg-green-50  border-green-200",  icon: CheckCircle },
  cancelled:           { label: "Отменён",    color: "text-gray-600   bg-gray-100  border-gray-200",   icon: XCircle },
  refunded:            { label: "Возврат",    color: "text-red-600    bg-red-50    border-red-200",    icon: RotateCcw },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full border ${cfg.color}`}>
      <Icon className="w-3 h-3" /> {cfg.label}
    </span>
  );
}

function formatPrice(amount: string, currency: string) {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(amount));
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [meta, setMeta] = useState<Meta>({ total: 0, page: 1, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [refundTarget, setRefundTarget] = useState<Order | null>(null);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (search) params.set("search", search);
    if (statusFilter) params.set("status", statusFilter);

    fetch(`/api/admin/orders?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setOrders(d.data ?? []);
        setMeta(d.meta ?? { total: 0, page: 1, pages: 1 });
      })
      .finally(() => setLoading(false));
  }, [page, search, statusFilter]);

  useEffect(load, [load]);

  const totalRevenue = orders
    .filter((o) => o.status === "paid")
    .reduce((s, o) => s + Number(o.amount), 0);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Заголовок */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Заказы</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {meta.total} заказов · выручка на странице:{" "}
            <span className="font-semibold text-green-600">
              {new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(totalRevenue)}
            </span>
          </p>
        </div>
        <button onClick={load} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Фильтры */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Email или имя пользователя…"
            className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
          >
            <option value="">Все статусы</option>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Таблица */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-gray-500 font-medium">Пользователь</th>
              <th className="text-left px-4 py-3 text-gray-500 font-medium">Оффер</th>
              <th className="text-left px-4 py-3 text-gray-500 font-medium">Сумма</th>
              <th className="text-left px-4 py-3 text-gray-500 font-medium">Статус</th>
              <th className="text-left px-4 py-3 text-gray-500 font-medium">Метод</th>
              <th className="text-left px-4 py-3 text-gray-500 font-medium">Дата</th>
              <th className="text-right px-4 py-3 text-gray-500 font-medium">Действия</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={7} className="text-center py-12 text-gray-400">Загрузка…</td></tr>
            ) : orders.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-12 text-gray-400">Заказов не найдено</td></tr>
            ) : (
              orders.map((order) => (
                <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <a href={`/admin/users/${order.user.id}`} className="hover:text-blue-600 transition-colors">
                      <div className="font-medium text-gray-900 truncate max-w-[180px]">
                        {order.user.fullName || order.user.email}
                      </div>
                      <div className="text-gray-400 text-xs truncate max-w-[180px]">{order.user.email}</div>
                    </a>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-gray-700 truncate max-w-[180px] block">{order.offer.title}</span>
                  </td>
                  <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap">
                    {formatPrice(order.amount, order.currency)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={order.status} />
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {order.paymentMethod ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                    {order.paidAt ? formatDate(order.paidAt) : formatDate(order.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {order.status === "paid" && (
                      <button
                        onClick={() => setRefundTarget(order)}
                        className="text-xs text-red-600 hover:bg-red-50 px-2 py-1 rounded transition-colors inline-flex items-center gap-1"
                        title="Возврат денег"
                      >
                        <RotateCcw className="w-3 h-3" /> Вернуть
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Пагинация */}
      {meta.pages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm disabled:opacity-40 hover:bg-gray-50 transition-colors"
          >
            ← Назад
          </button>
          <span className="text-sm text-gray-500">стр. {meta.page} / {meta.pages}</span>
          <button
            disabled={page >= meta.pages}
            onClick={() => setPage(page + 1)}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm disabled:opacity-40 hover:bg-gray-50 transition-colors"
          >
            Вперёд →
          </button>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 p-3 rounded-lg text-sm border shadow-lg ${
            toast.kind === "ok"
              ? "bg-green-50 text-green-700 border-green-200"
              : "bg-red-50 text-red-700 border-red-200"
          }`}
        >
          {toast.text}
        </div>
      )}

      {/* Refund modal */}
      {refundTarget && (
        <RefundModal
          order={refundTarget}
          onClose={() => setRefundTarget(null)}
          onDone={(msg) => {
            setRefundTarget(null);
            setToast({ kind: "ok", text: msg });
            setTimeout(() => setToast(null), 5000);
            load();
          }}
          onError={(msg) => {
            setToast({ kind: "err", text: msg });
            setTimeout(() => setToast(null), 5000);
          }}
        />
      )}
    </div>
  );
}

// ─── Модалка возврата ──────────────────────────────────────────────────────

function RefundModal({
  order,
  onClose,
  onDone,
  onError,
}: {
  order: Order;
  onClose: () => void;
  onDone: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const fullAmount = Number(order.amount);
  const [partial, setPartial] = useState(false);
  const [amount, setAmount] = useState(String(fullAmount));
  const [reason, setReason] = useState("");
  const [revokeAccess, setRevokeAccess] = useState(true);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = { revokeAccess };
      if (reason.trim()) body.reason = reason.trim();
      if (partial) {
        const amt = parseFloat(amount);
        if (!Number.isFinite(amt) || amt <= 0 || amt > fullAmount) {
          onError(`Сумма должна быть между 0 и ${fullAmount}`);
          setSaving(false);
          return;
        }
        body.amount = amt;
      }
      const res = await fetch(`/api/admin/orders/${order.id}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (data.alreadyRefunded) {
          onDone("Заказ уже был возвращён ранее");
        } else {
          const revokedNote =
            data.data?.revokedCourseIds?.length > 0
              ? ` Отозвано курсов: ${data.data.revokedCourseIds.length}.`
              : "";
          onDone(`Возврат на ${formatPrice(String(data.data?.amount ?? fullAmount), order.currency)} прошёл.${revokedNote}`);
        }
      } else {
        onError(data.error ?? "Не удалось сделать возврат");
      }
    } catch {
      onError("Ошибка сети");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-gray-900 flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-red-500" /> Возврат денег
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">{order.offer.title}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 flex gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              Деньги будут возвращены на ту же карту/счёт, с которого пришла оплата.
              Платёжный шлюз обрабатывает возврат в течение 1-30 банковских дней.
            </div>
          </div>

          {/* Пользователь */}
          <div className="text-sm">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Покупатель</div>
            <div className="font-medium">{order.user.fullName ?? order.user.email}</div>
            <div className="text-xs text-gray-500">{order.user.email}</div>
          </div>

          {/* Сумма */}
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Сумма к возврату</div>
            <div className="flex items-center gap-3 mb-2">
              <label className="flex items-center gap-1 text-sm">
                <input
                  type="radio"
                  checked={!partial}
                  onChange={() => setPartial(false)}
                />
                Полный ({formatPrice(order.amount, order.currency)})
              </label>
              <label className="flex items-center gap-1 text-sm">
                <input
                  type="radio"
                  checked={partial}
                  onChange={() => setPartial(true)}
                />
                Частичный
              </label>
            </div>
            {partial && (
              <input
                type="number"
                min={0.01}
                step={0.01}
                max={fullAmount}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            )}
          </div>

          {/* Причина */}
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Причина (для аудита)</div>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="Например: запросил клиент, не подошёл курс"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
            />
          </div>

          {/* Отзыв доступа */}
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={revokeAccess}
              onChange={(e) => setRevokeAccess(e.target.checked)}
              className="mt-0.5"
            />
            <div>
              <div>Отозвать доступ к курсам из этого заказа</div>
              <div className="text-xs text-gray-500">
                Удалит Enrollment'ы для курсов из снапшота — только если у пользователя
                нет другого оплаченного заказа с этим курсом.
              </div>
            </div>
          </label>
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
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
            {saving ? "Возвращаю…" : "Вернуть деньги"}
          </button>
        </div>
      </div>
    </div>
  );
}
