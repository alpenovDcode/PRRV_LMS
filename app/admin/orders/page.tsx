"use client";

import { useEffect, useState, useCallback } from "react";
import { Search, RefreshCw, CheckCircle, Clock, XCircle, RotateCcw, Filter, X, AlertTriangle, Loader2, Plus, Copy, ExternalLink, UserPlus } from "lucide-react";

interface Order {
  id: string;
  status: string;
  amount: string;
  currency: string;
  paymentMethod: string | null;
  paidAt: string | null;
  createdAt: string;
  /** null для гостевых заказов до /identify (клиент ещё не открыл ссылку). */
  user: { id: string; email: string; fullName: string | null } | null;
  offer: { id: string; title: string };
  // Guest-поля для аудита (что клиент ввёл в форме). Опциональны для совместимости.
  guestFullName?: string | null;
  guestEmail?: string | null;
  guestPhone?: string | null;
  userCreatedFromGuest?: boolean;
  // Дополнительные поля для карточки.
  ykPaymentId?: string | null;
  ykConfirmationUrl?: string | null;
  ykSnapshot?: Record<string, unknown> | null;
  /** Ответы на кастомные поля оффера — отдельная колонка (не затирается webhook'ом). */
  formAnswers?: Record<string, unknown> | null;
  /** UTM перехода — отдельная колонка. */
  utm?: Record<string, unknown> | null;
  snapshotOfferTitle?: string | null;
  refundedAt?: string | null;
  refundReason?: string | null;
  refundedAmount?: string | null;
  paymentLinkToken?: string | null;
}

interface Meta {
  total: number;
  page: number;
  pages: number;
  /**
   * Общая выручка по ОПЛАЧЕННЫМ заказам, по всем страницам, с
   * применёнными фильтрами. Считается на бэке через _sum(amount).
   * При фильтре по статусу != "paid" будет 0.
   */
  totalRevenue?: number;
  totalRevenueCurrency?: string;
}

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
  const [detailsOrder, setDetailsOrder] = useState<Order | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showGuestLink, setShowGuestLink] = useState(false);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [search, setSearch] = useState("");
  const [offerSearch, setOfferSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (search) params.set("search", search);
    if (offerSearch) params.set("offer", offerSearch);
    if (statusFilter) params.set("status", statusFilter);

    fetch(`/api/admin/orders?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setOrders(d.data ?? []);
        setMeta(d.meta ?? { total: 0, page: 1, pages: 1 });
      })
      .finally(() => setLoading(false));
  }, [page, search, offerSearch, statusFilter]);

  useEffect(load, [load]);

  // Выручка на текущей странице — для второй строки заголовка.
  // Главная цифра берётся из meta.totalRevenue (считается на бэке по всем).
  const pageRevenue = orders
    .filter((o) => o.status === "paid")
    .reduce((s, o) => s + Number(o.amount), 0);
  const fmtRub = (n: number) =>
    new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency: meta.totalRevenueCurrency ?? "RUB",
      maximumFractionDigits: 0,
    }).format(n);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Заголовок */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Заказы</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {meta.total.toLocaleString("ru-RU")} заказов
            {meta.totalRevenue !== undefined && (
              <>
                {" · "}общая выручка:{" "}
                <span className="font-semibold text-green-600">
                  {fmtRub(meta.totalRevenue)}
                </span>
              </>
            )}
            <span className="text-gray-400">
              {" · на странице: "}
              {fmtRub(pageRevenue)}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowGuestLink(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 hover:border-blue-400 hover:text-blue-700 text-sm font-medium rounded-lg transition-colors"
            title="Создать гостевую ссылку — клиент заполнит ФИО+email сам"
          >
            <UserPlus className="w-4 h-4" /> Гостевая ссылка
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" /> Создать заказ
          </button>
          <button onClick={load} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Фильтры */}
      <div className="flex gap-3 mb-4 flex-wrap">
        {/* Поиск по пользователю */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Email или имя пользователя…"
            className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>
        {/* Поиск по названию оффера (LMS + GC). Можно комбинировать с
            поиском по клиенту: «Иванов» + «Прорыв» → только заказы
            Иванова на офферы со словом «Прорыв». */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={offerSearch}
            onChange={(e) => { setOfferSearch(e.target.value); setPage(1); }}
            placeholder="Название оффера…"
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
              orders.map((order) => {
                const isGC = (order as any).source === "gc";
                const gcOrder = isGC ? (order as any) : null;
                return (
                  <tr
                    key={order.id}
                    className="hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => setDetailsOrder(order)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-start gap-1.5">
                        {isGC && (
                          <span className="mt-0.5 shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded bg-orange-100 text-orange-600 border border-orange-200">
                            GC
                          </span>
                        )}
                        <div className="min-w-0">
                          {order.user ? (
                            <a
                              href={`/admin/users/${order.user.id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="hover:text-blue-600 transition-colors"
                            >
                              <div className="font-medium text-gray-900 truncate max-w-[180px]">
                                {order.user.fullName || order.user.email}
                              </div>
                              <div className="text-gray-400 text-xs truncate max-w-[180px]">
                                {order.user.email}
                              </div>
                            </a>
                          ) : isGC ? (
                            <div>
                              <div className="font-medium text-gray-700 truncate max-w-[180px]">
                                {gcOrder.customerName || gcOrder.email}
                              </div>
                              <div className="text-gray-400 text-xs truncate max-w-[180px]">
                                {gcOrder.email}
                              </div>
                            </div>
                          ) : (
                            <div className="text-gray-500">
                              <div className="font-medium text-gray-700 truncate max-w-[180px] flex items-center gap-1.5">
                                <UserPlus className="w-3 h-3 text-blue-500" />
                                {(order as any).guestFullName || "Гостевая ссылка"}
                              </div>
                              <div className="text-gray-400 text-xs truncate max-w-[180px]">
                                {(order as any).guestEmail || "клиент ещё не открыл ссылку"}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
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
                      {!isGC && order.status === "paid" && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setRefundTarget(order);
                          }}
                          className="text-xs text-red-600 hover:bg-red-50 px-2 py-1 rounded transition-colors inline-flex items-center gap-1"
                          title="Возврат денег"
                        >
                          <RotateCcw className="w-3 h-3" /> Вернуть
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
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

      {/* Create order modal */}
      {showCreate && (
        <CreateOrderModal
          onClose={() => setShowCreate(false)}
          onDone={(msg) => {
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

      {/* Guest payment link modal */}
      {showGuestLink && (
        <GuestLinkModal
          onClose={() => setShowGuestLink(false)}
          onDone={(msg) => {
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

      {/* Карточка заказа — полные детали + диагностика. */}
      {detailsOrder && (
        <OrderDetailsModal
          order={detailsOrder}
          onClose={() => setDetailsOrder(null)}
          onRefund={() => {
            setRefundTarget(detailsOrder);
            setDetailsOrder(null);
          }}
        />
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
            {order.user ? (
              <>
                <div className="font-medium">{order.user.fullName ?? order.user.email}</div>
                <div className="text-xs text-gray-500">{order.user.email}</div>
              </>
            ) : (
              <div className="text-gray-500 italic">Гостевой заказ — пользователь не привязан</div>
            )}
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

// ─── Модалка создания заказа для пользователя ──────────────────────────────

interface UserSearchResult {
  id: string;
  email: string;
  fullName: string | null;
}

interface OfferOption {
  id: string;
  title: string;
  price: string;
  currency: string;
  isActive: boolean;
}

function CreateOrderModal({
  onClose,
  onDone,
  onError,
}: {
  onClose: () => void;
  onDone: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [userQuery, setUserQuery] = useState("");
  const [userResults, setUserResults] = useState<UserSearchResult[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserSearchResult | null>(null);
  const [offers, setOffers] = useState<OfferOption[]>([]);
  const [selectedOfferId, setSelectedOfferId] = useState("");
  const [reason, setReason] = useState("");
  const [sendEmailToClient, setSendEmailToClient] = useState(true);
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState<{
    orderId: string;
    paymentUrl: string;
    emailSent: boolean;
    emailError: string | null;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // Загружаем активные офферы при открытии
  useEffect(() => {
    fetch("/api/admin/offers")
      .then((r) => r.json())
      .then((d) => {
        const items: OfferOption[] = (d.data ?? []).filter((o: any) => o.isActive);
        setOffers(items);
      });
  }, []);

  // Поиск пользователей с debounce
  useEffect(() => {
    if (!userQuery.trim() || selectedUser) {
      setUserResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/admin/users?search=${encodeURIComponent(userQuery)}&limit=10`);
      const data = await res.json();
      setUserResults(data.data?.users ?? data.data ?? []);
    }, 300);
    return () => clearTimeout(t);
  }, [userQuery, selectedUser]);

  const handleCreate = async () => {
    if (!selectedUser || !selectedOfferId) return;
    setCreating(true);
    try {
      const res = await fetch("/api/admin/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selectedUser.id,
          offerId: selectedOfferId,
          reason: reason.trim() || undefined,
          sendEmail: sendEmailToClient,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setResult({
          orderId: data.data.orderId,
          paymentUrl: data.data.paymentUrl,
          emailSent: data.data.emailSent ?? false,
          emailError: data.data.emailError ?? null,
        });
      } else {
        onError(data.error ?? "Не удалось создать заказ");
      }
    } catch {
      onError("Ошибка сети");
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.paymentUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      onError("Не удалось скопировать");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-bold text-gray-900 flex items-center gap-2">
            <Plus className="w-4 h-4 text-blue-500" /> Создать заказ для клиента
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          {!result ? (
            <>
              {/* User picker */}
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                  Клиент
                </label>
                {selectedUser ? (
                  <div className="flex items-center gap-2 p-2 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">
                        {selectedUser.fullName ?? selectedUser.email}
                      </div>
                      <div className="text-xs text-gray-500 truncate">{selectedUser.email}</div>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedUser(null);
                        setUserQuery("");
                      }}
                      className="p-1 text-gray-400 hover:text-red-500 rounded"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                      <input
                        value={userQuery}
                        onChange={(e) => setUserQuery(e.target.value)}
                        placeholder="Email или имя…"
                        className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        autoFocus
                      />
                    </div>
                    {userResults.length > 0 && (
                      <div className="mt-1 max-h-48 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                        {userResults.map((u) => (
                          <button
                            key={u.id}
                            onClick={() => {
                              setSelectedUser(u);
                              setUserResults([]);
                              setUserQuery("");
                            }}
                            className="w-full text-left px-3 py-2 hover:bg-gray-50 transition-colors"
                          >
                            <div className="text-sm text-gray-900">{u.fullName ?? u.email}</div>
                            <div className="text-xs text-gray-500">{u.email}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Offer picker */}
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                  Оффер
                </label>
                <select
                  value={selectedOfferId}
                  onChange={(e) => setSelectedOfferId(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="">— выбери оффер —</option>
                  {offers.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.title} —{" "}
                      {new Intl.NumberFormat("ru-RU", {
                        style: "currency",
                        currency: o.currency,
                        maximumFractionDigits: 0,
                      }).format(Number(o.price))}
                    </option>
                  ))}
                </select>
              </div>

              {/* Reason */}
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                  Причина / комментарий (для аудита)
                </label>
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={500}
                  placeholder="Напр.: договорённость по телефону"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              {/* Send email checkbox */}
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={sendEmailToClient}
                  onChange={(e) => setSendEmailToClient(e.target.checked)}
                  className="mt-0.5"
                />
                <div>
                  <div>Отправить email клиенту со ссылкой на оплату</div>
                  <div className="text-xs text-gray-500">
                    Письмо с темой «Счёт на оплату: …» и кнопкой «Перейти к оплате».
                  </div>
                </div>
              </label>
            </>
          ) : (
            <>
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
                <CheckCircle className="w-5 h-5 inline mr-1 -mt-0.5" />
                Заказ создан.
                {result.emailSent ? (
                  <span> Email клиенту отправлен.</span>
                ) : result.emailError ? (
                  <span className="block mt-1 text-xs text-amber-700">
                    ⚠️ Email не отправлен: {result.emailError}. Скопируй ссылку вручную.
                  </span>
                ) : (
                  <span> Отправь клиенту ссылку:</span>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                  Ссылка для оплаты
                </label>
                <div className="flex gap-1">
                  <input
                    readOnly
                    value={result.paymentUrl}
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    {copied ? "Скопировано" : "Копировать"}
                  </button>
                </div>
                <a
                  href={result.paymentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                >
                  <ExternalLink className="w-3 h-3" /> Открыть в новой вкладке
                </a>
              </div>
              <p className="text-xs text-gray-500">
                Ссылка действует пока заказ не оплачен. После оплаты — статус
                сменится автоматически.
              </p>
            </>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm font-medium border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            {result ? "Закрыть" : "Отмена"}
          </button>
          {!result && (
            <button
              onClick={handleCreate}
              disabled={creating || !selectedUser || !selectedOfferId}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              {creating ? "Создаю…" : "Создать заказ"}
            </button>
          )}
          {result && (
            <button
              onClick={() => {
                onDone("Заказ создан");
                onClose();
              }}
              className="px-4 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Готово
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Гостевая ссылка оплаты. В отличие от CreateOrderModal — здесь НЕ нужен
 * существующий юзер: только оффер. Клиент сам заполнит ФИО/email на
 * странице оплаты, и в этот момент LMS его привяжет (найдёт по email или
 * создаст нового). Менеджер получает готовый URL и отправляет любому
 * потенциальному клиенту.
 */
function GuestLinkModal({
  onClose,
  onDone,
  onError,
}: {
  onClose: () => void;
  onDone: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [offers, setOffers] = useState<OfferOption[]>([]);
  const [selectedOfferId, setSelectedOfferId] = useState("");
  const [reason, setReason] = useState("");
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState<{ paymentUrl: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/admin/offers")
      .then((r) => r.json())
      .then((d) => {
        if (d.success || Array.isArray(d?.data?.offers)) {
          setOffers(d.data?.offers ?? d.data ?? []);
        }
      })
      .catch(() => {});
  }, []);

  const handleCreate = async () => {
    if (!selectedOfferId) return;
    setCreating(true);
    try {
      const res = await fetch("/api/admin/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "guest",
          offerId: selectedOfferId,
          reason: reason.trim() || undefined,
          sendEmail: false,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setResult({ paymentUrl: data.data.paymentUrl });
      } else {
        onError(data.error ?? "Не удалось создать ссылку");
      }
    } catch {
      onError("Ошибка сети");
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.paymentUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      onError("Не удалось скопировать");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-bold text-gray-900 flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-blue-500" /> Гостевая ссылка
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {!result ? (
            <>
              <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-900">
                Ссылка для потенциальных клиентов без аккаунта в LMS. Клиент
                откроет её, заполнит ФИО и email, оплатит — и сразу получит
                на почту доступ к курсу.
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Оффер
                </label>
                <select
                  value={selectedOfferId}
                  onChange={(e) => setSelectedOfferId(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
                >
                  <option value="">Выбери оффер…</option>
                  {offers.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.title} — {o.price} {o.currency ?? "RUB"}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Комментарий <span className="text-gray-400">(для аудита)</span>
                </label>
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Напр.: рассылка для подписчиков канала"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={onClose}
                  className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  Отмена
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!selectedOfferId || creating}
                  className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg disabled:opacity-50 flex items-center gap-1.5"
                >
                  {creating ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Создаю…
                    </>
                  ) : (
                    <>Создать ссылку</>
                  )}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-800 flex items-start gap-2">
                <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>
                  Гостевая ссылка готова. Отправь её клиенту — он заполнит свои
                  данные и оплатит, после чего получит доступ к курсу автоматически.
                </span>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Ссылка
                </label>
                <div className="flex gap-2">
                  <code className="flex-1 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-xs font-mono break-all">
                    {result.paymentUrl}
                  </code>
                  <button
                    onClick={handleCopy}
                    className="px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg flex items-center gap-1.5"
                  >
                    {copied ? (
                      <>
                        <CheckCircle className="w-3.5 h-3.5" /> Скопировано
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" /> Копировать
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={() => {
                    onDone("Гостевая ссылка создана");
                    onClose();
                  }}
                  className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg"
                >
                  Готово
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Карточка заказа: полные детали + диагностика. По клику на строку в таблице.
 *
 * Показывает: статус, суммы, метод оплаты, snapshot оффера, юзер vs guest-поля,
 * provider-данные (ykPaymentId, ykConfirmationUrl), снимок последнего webhook
 * (ykSnapshot — полезно для диагностики «почему активировался без оплаты»).
 */
function OrderDetailsModal({
  order,
  onClose,
  onRefund,
}: {
  order: Order;
  onClose: () => void;
  onRefund: () => void;
}) {
  const [showRaw, setShowRaw] = useState(false);
  const cfg = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.pending;
  const StatusIcon = cfg.icon;

  const guestEmail = order.guestEmail ?? null;
  const guestFullName = order.guestFullName ?? null;
  const guestPhone = order.guestPhone ?? null;
  const ykSnapshot = order.ykSnapshot ?? null;
  const cpStatus =
    ykSnapshot && typeof (ykSnapshot as any).Status === "string"
      ? (ykSnapshot as any).Status
      : null;
  const lastState =
    ykSnapshot && typeof (ykSnapshot as any).lastState === "string"
      ? (ykSnapshot as any).lastState
      : null;
  const lastEventType =
    ykSnapshot && typeof (ykSnapshot as any).lastEventType === "string"
      ? (ykSnapshot as any).lastEventType
      : null;
  const events =
    ykSnapshot && Array.isArray((ykSnapshot as any).events)
      ? ((ykSnapshot as any).events as Array<Record<string, unknown>>)
      : [];
  const installment = describeInstallment(order.paymentMethod, ykSnapshot, order.amount);
  const receipt = describeReceipt(ykSnapshot);
  const ofdReceipts = describeOfdReceipts(ykSnapshot);
  // Ответы на кастомные поля оффера. Сначала из отдельной колонки
  // (order.formAnswers — не затирается webhook'ом), для старых заказов
  // fallback на ykSnapshot.formAnswers.
  const formAnswers =
    order.formAnswers && typeof order.formAnswers === "object"
      ? (order.formAnswers as Record<string, unknown>)
      : ykSnapshot &&
          typeof (ykSnapshot as any).formAnswers === "object" &&
          (ykSnapshot as any).formAnswers !== null
        ? ((ykSnapshot as any).formAnswers as Record<string, unknown>)
        : null;
  // UTM-метки: тоже из отдельной колонки, fallback на ykSnapshot.utm.
  const utm =
    order.utm && typeof order.utm === "object"
      ? (order.utm as Record<string, unknown>)
      : ykSnapshot &&
          typeof (ykSnapshot as any).utm === "object" &&
          (ykSnapshot as any).utm !== null
        ? ((ykSnapshot as any).utm as Record<string, unknown>)
        : null;
  const utmEntries = utm
    ? Object.entries(utm).filter(([, v]) => v != null && v !== "")
    : [];

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full border ${cfg.color}`}
            >
              <StatusIcon className="w-3 h-3" /> {cfg.label}
            </span>
            <h2 className="font-bold text-gray-900">
              {order.snapshotOfferTitle ?? order.offer.title}
            </h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Сумма / даты */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KV
              label="Сумма"
              value={new Intl.NumberFormat("ru-RU", {
                style: "currency",
                currency: order.currency,
                maximumFractionDigits: 0,
              }).format(Number(order.amount))}
            />
            <KV label="Метод" value={formatPaymentMethod(order.paymentMethod)} />
            <KV
              label="Создан"
              value={new Date(order.createdAt).toLocaleString("ru-RU")}
            />
            <KV
              label="Оплачен"
              value={
                order.paidAt
                  ? new Date(order.paidAt).toLocaleString("ru-RU")
                  : "—"
              }
            />
          </div>

          {/* Покупатель */}
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 space-y-2">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Покупатель
            </div>
            {order.user ? (
              <div className="text-sm">
                <div className="font-medium">
                  {order.user.fullName || order.user.email}
                </div>
                <div className="text-xs text-gray-500">{order.user.email}</div>
                <a
                  href={`/admin/users/${order.user.id}`}
                  className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1 mt-1"
                >
                  Профиль <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            ) : (
              <div className="text-sm text-gray-500 italic">
                Гостевая ссылка — клиент ещё не открыл её и не заполнил форму.
              </div>
            )}

            {(guestEmail || guestFullName || guestPhone) && (
              <div className="text-xs text-gray-500 pt-2 border-t border-gray-200 space-y-0.5">
                <div className="font-semibold uppercase tracking-wide mb-1">
                  Введено на форме оплаты
                </div>
                {guestFullName && <div>ФИО: {guestFullName}</div>}
                {guestEmail && <div>Email: {guestEmail}</div>}
                {guestPhone && <div>Телефон: {guestPhone}</div>}
                {order.userCreatedFromGuest && (
                  <div className="text-blue-600">
                    Юзер создан в момент оплаты этой ссылки.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Ответы на кастомные поля формы оффера */}
          {formAnswers && Object.keys(formAnswers).length > 0 && (
            <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-3 space-y-2">
              <div className="text-xs font-semibold text-blue-700 uppercase tracking-wide">
                Анкета (поля формы оффера)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                {Object.entries(formAnswers).map(([k, v]) => (
                  <div key={k}>
                    <div className="text-[11px] text-gray-500">{k}</div>
                    <div className="text-gray-900 break-words">
                      {v === null || v === undefined || v === ""
                        ? "—"
                        : String(v)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* UTM-метки (атрибуция перехода по публичной ссылке) */}
          {utmEntries.length > 0 && (
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 space-y-1">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                UTM-метки
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                {utmEntries.map(([k, v]) => (
                  <div key={k}>
                    <span className="text-gray-400">{k}:</span>{" "}
                    <span className="text-gray-800 font-mono">{String(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Рассрочка / Кредит — только для BNPL-заказов (OTP / FreshCredit) */}
          {installment && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-amber-800 uppercase tracking-wide">
                  {installment.productLabel} · {installment.providerLabel}
                </div>
                {installment.approvalBadge && (
                  <span
                    className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${installment.approvalBadge.color}`}
                  >
                    {installment.approvalBadge.text}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                <KV label="Сумма договора" value={installment.contractSum} />
                <KV label="Оплачено" value={installment.paidSum} />
                <KV label="Остаток" value={installment.remainingSum} />
                {installment.contractNumber && (
                  <KV label="№ договора" value={installment.contractNumber} mono />
                )}
                {installment.stateDescription && (
                  <KV label="Статус договора" value={installment.stateDescription} />
                )}
                {installment.firstPayment && (
                  <KV label="Первый взнос" value={installment.firstPayment} />
                )}
              </div>
              {installment.rejectReason && (
                <div className="text-xs text-red-700 pt-2 border-t border-amber-200">
                  <b>Причина отказа:</b> {installment.rejectReason}
                </div>
              )}
            </div>
          )}

          {/* Чек (54-ФЗ) — из данных, которые мы передали в виджет CP.
              CP формирует чек в ОФД, отправляет клиенту на почту. */}
          {receipt && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-emerald-800 uppercase tracking-wide">
                  Чек · 54-ФЗ
                </div>
                <div className="text-[11px] text-emerald-700">
                  {receipt.taxationSystemLabel}
                </div>
              </div>

              <div className="border border-emerald-200 bg-white rounded overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-emerald-50/50 text-emerald-800">
                    <tr>
                      <th className="text-left px-2 py-1.5 font-medium">Позиция</th>
                      <th className="text-right px-2 py-1.5 font-medium w-14">Кол-во</th>
                      <th className="text-right px-2 py-1.5 font-medium w-20">Цена</th>
                      <th className="text-right px-2 py-1.5 font-medium w-20">Сумма</th>
                      <th className="text-right px-2 py-1.5 font-medium w-10">НДС</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-emerald-100">
                    {receipt.items.map((it, i) => (
                      <tr key={i}>
                        <td className="px-2 py-1.5 text-gray-900">{it.label}</td>
                        <td className="px-2 py-1.5 text-right text-gray-700">{it.quantity}</td>
                        <td className="px-2 py-1.5 text-right text-gray-700 whitespace-nowrap">
                          {it.priceFmt}
                        </td>
                        <td className="px-2 py-1.5 text-right font-medium text-gray-900 whitespace-nowrap">
                          {it.amountFmt}
                        </td>
                        <td className="px-2 py-1.5 text-right text-gray-500">
                          {it.vatLabel}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-emerald-50/50 font-semibold">
                    <tr>
                      <td colSpan={3} className="px-2 py-1.5 text-right text-gray-700">
                        Итого:
                      </td>
                      <td className="px-2 py-1.5 text-right text-gray-900 whitespace-nowrap">
                        {receipt.totalFmt}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-600 pt-1">
                {receipt.email && (
                  <div>
                    <span className="text-gray-400">Email клиента:</span>{" "}
                    <span className="font-medium text-gray-800">{receipt.email}</span>
                  </div>
                )}
                {receipt.phone && (
                  <div>
                    <span className="text-gray-400">Телефон:</span>{" "}
                    <span className="font-medium text-gray-800">{receipt.phone}</span>
                  </div>
                )}
                {receipt.paymentTypeLabel && (
                  <div>
                    <span className="text-gray-400">Тип расчёта:</span>{" "}
                    <span className="font-medium text-gray-800">
                      {receipt.paymentTypeLabel}
                    </span>
                  </div>
                )}
              </div>

              <div className="text-[11px] text-emerald-700 pt-1">
                Чек отправлен в ОФД и продублирован на email клиента (если указан).
              </div>

              {ofdReceipts.length > 0 && (
                <div className="pt-2 border-t border-emerald-200 space-y-1.5">
                  <div className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wide">
                    Фактические чеки ОФД ({ofdReceipts.length})
                  </div>
                  {ofdReceipts.map((r, i) => (
                    <div
                      key={i}
                      className="flex items-start justify-between gap-2 text-xs bg-white border border-emerald-200 rounded px-2 py-1.5"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-gray-800">
                          <span
                            className={`inline-block px-1.5 py-0.5 rounded font-mono text-[10px] mr-1 ${
                              r.type === "Refund"
                                ? "bg-orange-100 text-orange-700"
                                : "bg-emerald-100 text-emerald-700"
                            }`}
                          >
                            {r.typeLabel}
                          </span>
                          {r.documentNumber && (
                            <span className="text-gray-600">
                              № фд <span className="font-mono">{r.documentNumber}</span>
                            </span>
                          )}
                          {r.amount != null && (
                            <span className="text-gray-500"> · {r.amountFmt}</span>
                          )}
                        </div>
                        <div className="text-[10px] text-gray-500">{r.dateLabel}</div>
                      </div>
                      {r.fnUrl && (
                        <a
                          href={r.fnUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 text-[11px] text-blue-600 hover:underline inline-flex items-center gap-0.5"
                        >
                          Открыть чек <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Платёжная диагностика */}
          {(order.ykPaymentId || ykSnapshot || cpStatus || lastState || lastEventType) && (
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 space-y-2">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Платёж у провайдера
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <KV label="ID транзакции" value={order.ykPaymentId ?? "—"} mono />
                {cpStatus && <KV label="Статус CP" value={cpStatus} mono />}
                {lastState && (
                  <KV label="Последний state" value={lastState} mono />
                )}
                {lastEventType && (
                  <KV label="Последнее событие" value={lastEventType} mono />
                )}
              </div>

              {events.length > 0 && (
                <div className="pt-2 border-t border-gray-200">
                  <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    События провайдера ({events.length})
                  </div>
                  <div className="max-h-56 overflow-y-auto divide-y divide-gray-200 bg-white border border-gray-200 rounded">
                    {[...events].reverse().map((ev, i) => {
                      const type = String((ev as any).eventType ?? "?");
                      const providerStatus = (ev as any).providerStatus ?? null;
                      const normalized = String((ev as any).normalizedStatus ?? "");
                      const at = (ev as any).at ? new Date((ev as any).at as string) : null;
                      const method = (ev as any).paymentMethod ?? null;
                      const isActivation = normalized === "paid";
                      return (
                        <div
                          key={i}
                          className={`text-xs px-2 py-1.5 flex items-start gap-2 ${
                            isActivation ? "bg-green-50" : ""
                          }`}
                        >
                          <span
                            className={`shrink-0 mt-0.5 inline-block px-1.5 py-0.5 rounded font-mono text-[10px] ${eventBadgeColor(
                              type
                            )}`}
                          >
                            {type}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="text-gray-800">
                              <span className="font-medium">{normalized}</span>
                              {providerStatus && (
                                <span className="text-gray-400"> · {String(providerStatus)}</span>
                              )}
                              {method && (
                                <span className="text-gray-400"> · {String(method)}</span>
                              )}
                            </div>
                            {at && (
                              <div className="text-[10px] text-gray-500">
                                {at.toLocaleString("ru-RU")}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {ykSnapshot && (
                <div className="pt-2 border-t border-gray-200">
                  <button
                    onClick={() => setShowRaw((s) => !s)}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    {showRaw ? "Скрыть" : "Показать"} полный JSON ответа провайдера
                  </button>
                  {showRaw && (
                    <pre className="mt-2 max-h-60 overflow-auto text-[11px] font-mono bg-white border border-gray-200 rounded p-2 whitespace-pre-wrap break-all">
                      {JSON.stringify(ykSnapshot, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </div>
          )}

          {order.refundedAt && (
            <div className="rounded-lg border border-red-100 bg-red-50 p-3 space-y-1 text-sm">
              <div className="font-medium text-red-900">Возврат оформлен</div>
              <div className="text-xs text-red-700">
                {new Date(order.refundedAt).toLocaleString("ru-RU")}
                {order.refundedAmount &&
                  ` · ${order.refundedAmount} ${order.currency}`}
              </div>
              {order.refundReason && (
                <div className="text-xs text-red-700">
                  Причина: {order.refundReason}
                </div>
              )}
            </div>
          )}

          {order.paymentLinkToken && order.status === "pending" && (
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Ссылка оплаты
              </div>
              <div className="flex gap-2">
                <code className="flex-1 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-xs font-mono break-all">
                  {typeof window !== "undefined"
                    ? window.location.origin
                    : "https://prrv.tech"}
                  /pay/{order.id}?token={order.paymentLinkToken}
                </code>
                <button
                  onClick={() => {
                    const url = `${
                      typeof window !== "undefined"
                        ? window.location.origin
                        : "https://prrv.tech"
                    }/pay/${order.id}?token=${order.paymentLinkToken}`;
                    navigator.clipboard.writeText(url).catch(() => {});
                  }}
                  className="px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg flex items-center gap-1.5"
                >
                  <Copy className="w-3.5 h-3.5" /> Копировать
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-gray-100">
            <div className="text-xs text-gray-400 font-mono">ID: {order.id}</div>
            <div className="flex items-center gap-2">
              {order.status === "paid" && (
                <button
                  onClick={onRefund}
                  className="px-3 py-2 text-sm bg-red-50 hover:bg-red-100 text-red-700 font-medium rounded-lg flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Вернуть деньги
                </button>
              )}
              <button
                onClick={onClose}
                className="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Маленький key/value-блок для read-only полей карточки заказа. */
function KV({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-xs text-gray-500 mb-0.5">{label}</div>
      <div className={`text-sm text-gray-900 ${mono ? "font-mono" : ""} truncate`}>
        {value}
      </div>
    </div>
  );
}

// ─── Payment method / installment helpers ─────────────────────────────────
// Метод хранится как компактный machine-код («TinkoffPay», «otp:installment»,
// «freshcredit:credit», «card:visa» и т.п. — см. deriveMethod в провайдерах).
// Для карточки заказа даём человеко-читаемое название.
function formatPaymentMethod(m: string | null | undefined): string {
  if (!m) return "—";
  const map: Record<string, string> = {
    "otp:credit": "Кредит · ОТП Банк",
    "otp:credit_discount": "Кредит со скидкой · ОТП Банк",
    "otp:installment": "Рассрочка · ОТП Банк",
    "freshcredit:credit": "Кредит · FreshCredit",
    "freshcredit:installment": "Рассрочка · FreshCredit",
    freshcredit: "FreshCredit",
    tinkoffpay: "TinkoffPay",
    sbp: "СБП",
    dolyame: "Долями (рассрочка · Т-Банк)",
    tcsinstallment: "Рассрочка · Т-Банк (через CloudPayments)",
    tinkoffinstallment: "Рассрочка · Т-Банк (через CloudPayments)",
    tinkoffbroker: "Т-брокер · рассрочка",
    tcscredit: "Кредит · Т-Банк (через CloudPayments)",
    mock_card: "Тестовая карта",
  };
  const low = m.toLowerCase();
  if (map[low]) return map[low];
  if (low.startsWith("card:")) return `Карта ${low.slice(5).toUpperCase()}`;
  return m;
}

// Определяет CP-based рассрочку по значению PaymentMethod. У Т-Банка через
// CP это TcsInstallment / TinkoffInstallment / TinkoffBroker, для Долями —
// Dolyame. Для этих методов деньги мерчанту приходят сразу одним Pay-webhook.
function isCpInstallmentMethod(m: string): boolean {
  const low = m.toLowerCase();
  return (
    low === "tcsinstallment" ||
    low === "tinkoffinstallment" ||
    low === "tinkoffbroker" ||
    low === "tcscredit" ||
    low === "dolyame"
  );
}

// Возвращает данные для секции «Рассрочка / Кредит», если это BNPL-заказ.
// Работает для OTP (state, agreementNumber, creditAmount, firstPayment) и
// FreshCredit (paymentSum, contractNumber, creditType, refundSum).
// Для обычных CP-заказов (карта / SBP / TinkoffPay) — null.
function describeInstallment(
  paymentMethod: string | null | undefined,
  snapshot: Record<string, unknown> | null | undefined,
  orderAmount: string
): {
  productLabel: string;
  providerLabel: string;
  contractSum: string;
  paidSum: string;
  remainingSum: string;
  contractNumber?: string;
  stateDescription?: string;
  firstPayment?: string;
  rejectReason?: string;
  approvalBadge?: { text: string; color: string };
} | null {
  if (!paymentMethod) return null;
  const method = paymentMethod.toLowerCase();
  const isOtp = method.startsWith("otp:");
  const isFc = method.startsWith("freshcredit");
  const isCpInst = isCpInstallmentMethod(method);
  if (!isOtp && !isFc && !isCpInst) return null;

  const snap = (snapshot ?? {}) as Record<string, any>;
  const fmt = (v: unknown) =>
    v == null || v === ""
      ? "—"
      : new Intl.NumberFormat("ru-RU", {
          style: "currency",
          currency: "RUB",
          maximumFractionDigits: 0,
        }).format(Number(v));

  if (isCpInst) {
    // Рассрочка через CloudPayments (Т-брокер / Долями). Деньги мерчанту
    // приходят одним Pay-webhook — с точки зрения LMS заказ полностью оплачен.
    // Клиент дальше выплачивает партнёру по договору, LMS в этом не участвует.
    const providerLabel =
      method === "dolyame"
        ? "Долями (Т-Банк)"
        : method === "tinkoffbroker"
          ? "Т-брокер"
          : "Т-Банк · CloudPayments";
    const productLabel =
      method === "tcscredit" ? "Кредит" : "Рассрочка";
    return {
      productLabel,
      providerLabel,
      contractSum: fmt(orderAmount),
      paidSum: fmt(orderAmount),
      remainingSum: fmt(0),
      contractNumber:
        typeof snap.TransactionId === "string" || typeof snap.TransactionId === "number"
          ? String(snap.TransactionId)
          : undefined,
      stateDescription:
        "Деньги мерчанту зачислены сразу · клиент выплачивает партнёру по договору",
      approvalBadge: {
        text: "Оплачено · договор у партнёра",
        color: "border-green-300 bg-green-50 text-green-700",
      },
    };
  }

  if (isOtp) {
    // OTP: creditAmount — сумма кредита, firstPayment — первый взнос клиента.
    // «Оплачено» до state=AGREEMENT_PAID = firstPayment (то, что внёс клиент
    // прямо при оформлении); после активации мерчанту приходит вся сумма.
    const state = String(snap.lastState ?? "");
    const contractAmount = snap.creditAmount ?? snap.goodsCreditAmount ?? orderAmount;
    const firstPayment = Number(snap.firstPayment ?? 0);
    const isPaid = state === "AGREEMENT_PAID";
    const paid = isPaid ? Number(contractAmount) : firstPayment;
    const remaining = Math.max(0, Number(contractAmount) - paid);

    const productType = Number(snap.productType);
    const productLabel =
      productType === 3
        ? "Рассрочка"
        : productType === 2
          ? "Кредит со скидкой"
          : productType === 1
            ? "Кредит"
            : "Рассрочка/кредит";

    return {
      productLabel,
      providerLabel: "ОТП Банк",
      contractSum: fmt(contractAmount),
      paidSum: fmt(paid),
      remainingSum: fmt(remaining),
      contractNumber:
        typeof snap.agreementNumber === "string" ? snap.agreementNumber : undefined,
      stateDescription:
        typeof snap.lastStateDescription === "string" && snap.lastStateDescription
          ? snap.lastStateDescription
          : otpStateLabel(state),
      firstPayment: firstPayment ? fmt(firstPayment) : undefined,
      rejectReason:
        typeof snap.rejectReason === "string" && snap.rejectReason
          ? snap.rejectReason
          : undefined,
      approvalBadge: otpApprovalBadge(state),
    };
  }

  // FreshCredit
  const state = String(snap.lastState ?? "");
  const contractSum = snap.paymentSum ?? orderAmount;
  const refundSum = Number(snap.refundSum ?? 0);
  const isIssued = state === "issued";
  const paid = isIssued ? Number(contractSum) - refundSum : 0;
  const remaining = Math.max(0, Number(contractSum) - paid);

  const creditType = Number(snap.creditType);
  const productLabel =
    creditType === 2 ? "Рассрочка" : creditType === 1 ? "Кредит" : "Рассрочка/кредит";

  return {
    productLabel,
    providerLabel: "FreshCredit",
    contractSum: fmt(contractSum),
    paidSum: fmt(paid),
    remainingSum: fmt(remaining),
    contractNumber:
      typeof snap.contractNumber === "string" ? snap.contractNumber : undefined,
    stateDescription:
      typeof snap.lastStatusDescription === "string" && snap.lastStatusDescription
        ? snap.lastStatusDescription
        : fcStateLabel(state),
    approvalBadge: fcApprovalBadge(state),
  };
}

function otpStateLabel(state: string): string {
  const map: Record<string, string> = {
    OPTY_PREPARED: "Заявка подготовлена",
    OPTY_CREATED: "Заявка создана",
    DECISION_PRE_APPROVAL: "Предварительное одобрение",
    DECISION_APPROVAL: "Одобрено банком",
    DECISION_INFORMATION: "Требуется информация",
    ESIA_CONFIRMED: "ЕСИА подтверждён",
    AGREEMENT_CREATED_PAPER: "Договор создан (бумажный)",
    AGREEMENT_CREATED_ELECTRONIC: "Договор создан (электронный)",
    AGREEMENT_SIGNED: "Договор подписан",
    AGREEMENT_AUTHORIZED: "Договор авторизован",
    AGREEMENT_PAID: "Оплачено · доступ выдан",
    AGREEMENT_SIGN_FAILED: "Ошибка подписания",
    REJECTED: "Отклонено банком",
    CANCEL_AUTHORIZATION: "Отмена авторизации",
    NOT_PAYABLE: "Оплата невозможна",
  };
  return map[state] ?? state ?? "—";
}

function otpApprovalBadge(state: string): { text: string; color: string } | undefined {
  if (state === "AGREEMENT_PAID")
    return { text: "Оплачено", color: "border-green-300 bg-green-50 text-green-700" };
  if (["REJECTED", "AGREEMENT_SIGN_FAILED", "NOT_PAYABLE"].includes(state))
    return { text: "Отказ", color: "border-red-300 bg-red-50 text-red-700" };
  if (state === "DECISION_APPROVAL")
    return { text: "Одобрено", color: "border-blue-300 bg-blue-50 text-blue-700" };
  if (state === "AGREEMENT_SIGNED" || state === "AGREEMENT_AUTHORIZED")
    return { text: "Договор подписан", color: "border-indigo-300 bg-indigo-50 text-indigo-700" };
  if (state) return { text: "В процессе", color: "border-gray-300 bg-gray-50 text-gray-700" };
  return undefined;
}

function fcStateLabel(state: string): string {
  const map: Record<string, string> = {
    pending: "Заявка отправлена",
    approved: "Одобрено",
    cooling: "Период охлаждения",
    issued: "Выдан · доступ открыт",
    cancel: "Отменено",
    rejected: "Отклонено",
    refund: "Возврат",
  };
  return map[state] ?? state ?? "—";
}

function fcApprovalBadge(state: string): { text: string; color: string } | undefined {
  if (state === "issued")
    return { text: "Оплачено", color: "border-green-300 bg-green-50 text-green-700" };
  if (state === "cancel" || state === "rejected")
    return { text: "Отказ", color: "border-red-300 bg-red-50 text-red-700" };
  if (state === "approved")
    return { text: "Одобрено", color: "border-blue-300 bg-blue-50 text-blue-700" };
  if (state === "cooling")
    return { text: "Охлаждение", color: "border-amber-300 bg-amber-50 text-amber-700" };
  if (state)
    return { text: "В процессе", color: "border-gray-300 bg-gray-50 text-gray-700" };
  return undefined;
}

// Извлекаем чек 54-ФЗ из snapshot. CP возвращает то, что мы передали
// в виджет, внутри поля Data (строка JSON) → CloudPayments.CustomerReceipt.
// Формат: { Items: [{label, price, quantity, amount, vat, method, object}],
//           taxationSystem, email, phone, isBso, amounts }
function describeReceipt(
  snapshot: Record<string, unknown> | null | undefined
): {
  items: Array<{
    label: string;
    quantity: number;
    priceFmt: string;
    amountFmt: string;
    vatLabel: string;
  }>;
  totalFmt: string;
  email?: string;
  phone?: string;
  taxationSystemLabel: string;
  paymentTypeLabel?: string;
} | null {
  if (!snapshot) return null;
  const dataRaw = (snapshot as any).Data;
  if (dataRaw == null) return null;

  // Data приходит от CP как строка (form-urlencoded). Иногда уже как объект.
  let data: any = dataRaw;
  if (typeof dataRaw === "string") {
    try {
      data = JSON.parse(dataRaw);
    } catch {
      return null;
    }
  }
  const cr = data?.CloudPayments?.CustomerReceipt;
  if (!cr || !Array.isArray(cr.Items) || cr.Items.length === 0) return null;

  const fmt = (v: unknown) =>
    v == null || v === ""
      ? "—"
      : new Intl.NumberFormat("ru-RU", {
          style: "currency",
          currency: "RUB",
          maximumFractionDigits: 2,
        }).format(Number(v));

  const items = cr.Items.map((it: any) => ({
    label: String(it.label ?? "—"),
    quantity: Number(it.quantity ?? 1),
    priceFmt: fmt(it.price),
    amountFmt: fmt(it.amount ?? Number(it.price) * Number(it.quantity ?? 1)),
    vatLabel: it.vat == null ? "—" : `${it.vat}%`,
  }));

  const total = cr.Items.reduce(
    (s: number, it: any) => s + Number(it.amount ?? Number(it.price) * Number(it.quantity ?? 1)),
    0
  );

  // Наиболее частые method: 4 (полный расчёт), 1 (предоплата 100%).
  const methodFirst = cr.Items[0]?.method;
  const paymentTypeLabel =
    methodFirst === 1
      ? "Предоплата 100%"
      : methodFirst === 4
        ? "Полный расчёт"
        : methodFirst
          ? `method=${methodFirst}`
          : undefined;

  return {
    items,
    totalFmt: fmt(total),
    email: typeof cr.email === "string" ? cr.email : undefined,
    phone: typeof cr.phone === "string" ? cr.phone : undefined,
    taxationSystemLabel: taxationSystemLabel(cr.taxationSystem),
    paymentTypeLabel,
  };
}

// Фактические чеки, полученные через Receipt-webhook от CP (после
// регистрации в ОФД). Накапливаются в snapshot.receipts[] — их может быть
// несколько (доход + возврат, или повторная фискализация).
function describeOfdReceipts(
  snapshot: Record<string, unknown> | null | undefined
): Array<{
  fnUrl: string | null;
  documentNumber: string | null;
  amount: number | null;
  amountFmt: string;
  type: string | null;
  typeLabel: string;
  dateLabel: string;
}> {
  if (!snapshot) return [];
  const arr = (snapshot as any).receipts;
  if (!Array.isArray(arr)) return [];

  const fmt = (v: unknown) =>
    v == null
      ? "—"
      : new Intl.NumberFormat("ru-RU", {
          style: "currency",
          currency: "RUB",
          maximumFractionDigits: 2,
        }).format(Number(v));

  return arr.map((r: any) => {
    const type = typeof r?.type === "string" ? r.type : null;
    const dt = r?.receiptDateTime
      ? new Date(String(r.receiptDateTime))
      : r?.receivedAt
        ? new Date(String(r.receivedAt))
        : null;
    return {
      fnUrl: typeof r?.fnUrl === "string" ? r.fnUrl : null,
      documentNumber:
        r?.documentNumber != null ? String(r.documentNumber) : null,
      amount: r?.amount != null ? Number(r.amount) : null,
      amountFmt: r?.amount != null ? fmt(r.amount) : "—",
      type,
      typeLabel:
        type === "Refund"
          ? "Возврат"
          : type === "Income"
            ? "Приход"
            : type ?? "Чек",
      dateLabel: dt ? dt.toLocaleString("ru-RU") : "—",
    };
  });
}

function taxationSystemLabel(sys: unknown): string {
  const n = Number(sys);
  const map: Record<number, string> = {
    0: "ОСН",
    1: "УСН доходы",
    2: "УСН доходы − расходы",
    3: "ЕНВД",
    4: "ЕСХН",
    5: "Патент",
  };
  return map[n] ?? `Система налогообложения ${sys ?? "?"}`;
}

function eventBadgeColor(eventType: string): string {
  const map: Record<string, string> = {
    Check: "bg-gray-100 text-gray-700",
    Pay: "bg-green-100 text-green-700",
    Fail: "bg-red-100 text-red-700",
    Refund: "bg-orange-100 text-orange-700",
    Confirm: "bg-blue-100 text-blue-700",
    Recurrent: "bg-purple-100 text-purple-700",
  };
  return map[eventType] ?? "bg-gray-100 text-gray-500";
}
