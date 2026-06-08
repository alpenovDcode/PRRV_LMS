"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useState } from "react";
import { ShoppingCart, ChevronDown, ChevronUp } from "lucide-react";

interface GcOrder {
  id: string;
  gcOrderId: string;
  gcNumber: string | null;
  customerName: string | null;
  email: string;
  composition: string | null;
  status: string | null;
  amount: string | null;
  amountPaid: string | null;
  currency: string | null;
  paymentMethod: string | null;
  gcCreatedAt: string | null;
  gcPaidAt: string | null;
  data: Record<string, string | null>;
}

const GC_STATUS_COLOR: Record<string, string> = {
  "оплачен": "text-green-700 bg-green-50 border-green-200",
  "paid": "text-green-700 bg-green-50 border-green-200",
  "ожидание оплаты": "text-yellow-700 bg-yellow-50 border-yellow-200",
  "pending": "text-yellow-700 bg-yellow-50 border-yellow-200",
  "отменен": "text-gray-600 bg-gray-100 border-gray-200",
  "cancelled": "text-gray-600 bg-gray-100 border-gray-200",
  "возврат": "text-red-700 bg-red-50 border-red-200",
  "refunded": "text-red-700 bg-red-50 border-red-200",
};

function statusColor(status: string | null) {
  const key = status?.toLowerCase().trim() ?? "";
  return GC_STATUS_COLOR[key] ?? "text-gray-600 bg-gray-100 border-gray-200";
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

function formatAmount(amount: string | null, currency: string | null) {
  if (!amount || amount === "0") return "—";
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: currency ?? "RUB",
    maximumFractionDigits: 0,
  }).format(Number(amount));
}

function OrderDetail({ order }: { order: GcOrder }) {
  const [expanded, setExpanded] = useState(false);

  const mainFields = [
    { label: "ID заказа", value: order.gcOrderId },
    { label: "Номер", value: order.gcNumber },
    { label: "Состав заказа", value: order.composition },
    { label: "Платёжная система", value: order.paymentMethod },
    { label: "Дата создания", value: formatDate(order.gcCreatedAt) },
    { label: "Дата оплаты", value: formatDate(order.gcPaidAt) },
    { label: "Оплачено", value: formatAmount(order.amountPaid, order.currency) },
  ];

  return (
    <div className="border border-gray-100 rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-medium text-gray-900 text-sm">
            #{order.gcOrderId}
            {order.gcNumber && <span className="text-gray-400 ml-1">(№{order.gcNumber})</span>}
          </div>
          <div className="text-xs text-gray-500 mt-0.5 line-clamp-2">{order.composition ?? "—"}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="font-semibold text-gray-900 text-sm whitespace-nowrap">
            {formatAmount(order.amount, order.currency)}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${statusColor(order.status)}`}>
            {order.status ?? "—"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        {mainFields.map((f) => (
          <div key={f.label} className="flex flex-col">
            <span className="text-xs text-gray-400">{f.label}</span>
            <span className="text-xs text-gray-700 break-words">{f.value || "—"}</span>
          </div>
        ))}
      </div>

      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
      >
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {expanded ? "Скрыть все поля" : "Все поля заказа"}
      </button>

      {expanded && (
        <div className="pt-2 border-t border-gray-50 grid grid-cols-2 gap-x-4 gap-y-1.5">
          {Object.entries(order.data ?? {}).map(([key, value]) => (
            value ? (
              <div key={key} className="flex flex-col">
                <span className="text-xs text-gray-400 break-words">{key}</span>
                <span className="text-xs text-gray-700 break-words">{value}</span>
              </div>
            ) : null
          ))}
        </div>
      )}
    </div>
  );
}

export function GetcourseOrdersTab({ userId }: { userId: string }) {
  const { data: orders, isLoading } = useQuery<GcOrder[]>({
    queryKey: ["admin", "users", userId, "getcourse-orders"],
    queryFn: async () => {
      const res = await apiClient.get(`/admin/users/${userId}/getcourse-orders`);
      return res.data.data;
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="border-none shadow-sm bg-white">
            <CardContent className="p-4 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/4" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!orders || orders.length === 0) {
    return (
      <Card className="border-none shadow-sm bg-white">
        <CardContent className="py-16 flex flex-col items-center gap-3 text-center">
          <ShoppingCart className="h-12 w-12 text-gray-200" />
          <p className="text-gray-500 font-medium">Нет заказов GetCourse</p>
          <p className="text-sm text-gray-400 max-w-xs">
            Заказы появятся после импорта CSV-файла из GetCourse
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-sm text-gray-400">
        Заказов GetCourse: {orders.length}
      </div>
      <Card className="border-none shadow-sm bg-white">
        <CardContent className="p-4 space-y-3">
          {orders.map((order) => (
            <OrderDetail key={order.id} order={order} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
