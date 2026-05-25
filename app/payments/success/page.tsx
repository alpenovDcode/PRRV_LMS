"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { CheckCircle, Loader2, ArrowRight } from "lucide-react";
import { Suspense } from "react";

function SuccessContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const orderId = searchParams.get("orderId");

  const [status, setStatus] = useState<"loading" | "paid" | "pending" | "error">("loading");
  const [offerTitle, setOfferTitle] = useState("");

  useEffect(() => {
    if (!orderId) { setStatus("error"); return; }

    let attempts = 0;
    const poll = async () => {
      try {
        const res = await fetch(`/api/payments/status/${orderId}`);
        const data = await res.json();
        if (!data.success) { setStatus("error"); return; }

        setOfferTitle(data.data.offer?.title ?? "");

        if (data.data.status === "paid") {
          setStatus("paid");
        } else if (attempts++ < 10) {
          setTimeout(poll, 2000);
        } else {
          setStatus("pending");
        }
      } catch {
        setStatus("error");
      }
    };
    poll();
  }, [orderId]);

  if (status === "loading") {
    return (
      <div className="text-center">
        <Loader2 className="w-12 h-12 animate-spin text-blue-500 mx-auto mb-4" />
        <p className="text-gray-600">Проверяем платёж…</p>
      </div>
    );
  }

  if (status === "paid") {
    return (
      <div className="text-center">
        <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="w-12 h-12 text-green-500" />
        </div>
        <h1 className="text-3xl font-black text-gray-900 mb-2">Оплата прошла!</h1>
        {offerTitle && <p className="text-gray-500 mb-6">«{offerTitle}» теперь доступен</p>}
        <button
          onClick={() => router.push("/learn")}
          className="inline-flex items-center gap-2 bg-blue-600 text-white font-bold py-3 px-6 rounded-xl hover:bg-blue-700 transition-colors"
        >
          Перейти к обучению <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    );
  }

  if (status === "pending") {
    return (
      <div className="text-center">
        <div className="w-24 h-24 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <Loader2 className="w-12 h-12 text-yellow-500" />
        </div>
        <h1 className="text-2xl font-black text-gray-900 mb-2">Платёж обрабатывается</h1>
        <p className="text-gray-500 mb-6">Это может занять несколько минут. Доступ откроется автоматически.</p>
        <button
          onClick={() => router.push("/learn")}
          className="inline-flex items-center gap-2 border border-gray-200 text-gray-700 font-medium py-3 px-6 rounded-xl hover:bg-gray-50 transition-colors"
        >
          На главную
        </button>
      </div>
    );
  }

  return (
    <div className="text-center">
      <p className="text-gray-500 mb-4">Не удалось получить статус заказа.</p>
      <button onClick={() => router.push("/")} className="text-blue-600 hover:underline">На главную</button>
    </div>
  );
}

export default function PaymentSuccessPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 max-w-md w-full">
        <Suspense fallback={<Loader2 className="w-8 h-8 animate-spin mx-auto" />}>
          <SuccessContent />
        </Suspense>
      </div>
    </div>
  );
}
