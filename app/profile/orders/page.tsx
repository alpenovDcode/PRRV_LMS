"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle, Clock, RotateCcw, XCircle, ExternalLink, ShoppingBag, BookOpen } from "lucide-react";

interface MyOrder {
  id: string;
  status: string;
  amount: string;
  currency: string;
  paymentMethod: string | null;
  paidAt: string | null;
  createdAt: string;
  refundedAt: string | null;
  refundedAmount: string | null;
  offerTitle: string;
  courseCount: number;
  paymentUrl: string | null;
}

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; icon: any }
> = {
  pending: { label: "Ждёт оплаты", color: "text-yellow-700 bg-yellow-50 border-yellow-200", icon: Clock },
  waiting_for_capture: { label: "Холд", color: "text-blue-700 bg-blue-50 border-blue-200", icon: Clock },
  paid: { label: "Оплачен", color: "text-green-700 bg-green-50 border-green-200", icon: CheckCircle },
  cancelled: { label: "Отменён", color: "text-gray-600 bg-gray-100 border-gray-200", icon: XCircle },
  refunded: { label: "Возврат", color: "text-red-700 bg-red-50 border-red-200", icon: RotateCcw },
};

function formatPrice(amount: string, currency: string) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(amount));
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function MyOrdersPage() {
  const [orders, setOrders] = useState<MyOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/me/orders")
      .then((r) => r.json())
      .then((d) => setOrders(d.data ?? []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-3xl mx-auto p-6">
      <Link
        href="/profile"
        className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> К профилю
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <ShoppingBag className="w-6 h-6 text-blue-500" /> Мои покупки
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          История заказов и доступные оплаты
        </p>
      </div>

      {loading ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center text-gray-400 text-sm">
          Загрузка…
        </div>
      ) : orders.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center">
          <ShoppingBag className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Покупок пока нет</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => {
            const cfg = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.pending;
            const Icon = cfg.icon;
            return (
              <div
                key={order.id}
                className="bg-white border border-gray-200 rounded-2xl p-4 hover:border-gray-300 transition-colors"
              >
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full border ${cfg.color}`}
                      >
                        <Icon className="w-3 h-3" /> {cfg.label}
                      </span>
                      {order.courseCount > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                          <BookOpen className="w-3 h-3" /> {order.courseCount}{" "}
                          {order.courseCount === 1 ? "курс" : "курсов"}
                        </span>
                      )}
                    </div>
                    <div className="font-semibold text-gray-900 mb-1">{order.offerTitle}</div>
                    <div className="text-xs text-gray-500">
                      {order.status === "paid" && order.paidAt
                        ? `Оплачен ${formatDate(order.paidAt)}`
                        : order.status === "refunded" && order.refundedAt
                        ? `Возвращён ${formatDate(order.refundedAt)}`
                        : `Создан ${formatDate(order.createdAt)}`}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="font-bold text-gray-900">
                      {formatPrice(order.amount, order.currency)}
                    </div>
                    {order.refundedAmount && (
                      <div className="text-xs text-red-600 mt-0.5">
                        возвращено {formatPrice(order.refundedAmount, order.currency)}
                      </div>
                    )}
                  </div>
                </div>

                {/* Действия */}
                {order.paymentUrl && order.status === "pending" && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <a
                      href={order.paymentUrl}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Перейти к оплате
                    </a>
                  </div>
                )}

                {order.status === "paid" && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <Link
                      href="/learn"
                      className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      Перейти к обучению
                    </Link>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
