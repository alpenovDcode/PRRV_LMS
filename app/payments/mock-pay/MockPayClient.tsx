"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CreditCard, X, CheckCircle } from "lucide-react";

/**
 * Клиентский компонент симуляции оплаты (рендерится только когда серверный
 * родитель уже убедился, что mock-провайдер активен).
 */
/**
 * Допускаем редирект только на same-origin URL.
 * Защита от open-redirect: пользователь не должен попасть на evil.example.com
 * после клика «Оплатить» по подсунутому URL.
 */
function safeReturnUrl(raw: string): string {
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin) return "/";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/";
  }
}

function MockPayContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId") ?? "";
  const paymentId = searchParams.get("paymentId") ?? "";
  const rawReturnUrl = searchParams.get("returnUrl") ?? "/";

  const [done, setDone] = useState(false);

  const simulatePay = async (success: boolean) => {
    // Серверный роут проксирует вебхук со shared-secret.
    // Клиенту секрет не виден; в проде /api/payments/mock-complete вернёт 404.
    await fetch("/api/payments/mock-complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paymentId,
        orderId,
        outcome: success ? "paid" : "cancelled",
      }),
    }).catch(() => {});

    setDone(true);
    const safeUrl = safeReturnUrl(rawReturnUrl);
    setTimeout(() => {
      window.location.href = safeUrl;
    }, 1200);
  };

  if (done) {
    return (
      <div className="text-center py-8">
        <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
        <p className="text-gray-600">Перенаправляем…</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <div className="w-8 h-8 bg-yellow-100 rounded-full flex items-center justify-center text-yellow-600 font-bold text-sm">
          DEV
        </div>
        <p className="text-sm text-yellow-700 font-medium">Mock-провайдер — только для разработки</p>
      </div>

      <h1 className="text-xl font-bold text-gray-900 mb-1">Симуляция оплаты</h1>
      <p className="text-gray-400 text-sm mb-6">Order ID: <code className="bg-gray-100 px-1 rounded">{orderId}</code></p>

      <div className="space-y-3">
        <button
          onClick={() => simulatePay(true)}
          className="w-full py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors"
        >
          <CreditCard className="w-5 h-5" />
          Оплатить (успешно)
        </button>
        <button
          onClick={() => simulatePay(false)}
          className="w-full py-3 border border-red-200 text-red-600 hover:bg-red-50 font-medium rounded-xl flex items-center justify-center gap-2 transition-colors"
        >
          <X className="w-5 h-5" />
          Отменить платёж
        </button>
      </div>
    </div>
  );
}

export default function MockPayClient() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 max-w-sm w-full">
        <Suspense>
          <MockPayContent />
        </Suspense>
      </div>
    </div>
  );
}
