"use client";

import { useEffect, useState, useCallback } from "react";
import { Search, RefreshCw, CheckCircle, Clock, XCircle, RotateCcw, Filter } from "lucide-react";

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
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={6} className="text-center py-12 text-gray-400">Загрузка…</td></tr>
            ) : orders.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-12 text-gray-400">Заказов не найдено</td></tr>
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
    </div>
  );
}
