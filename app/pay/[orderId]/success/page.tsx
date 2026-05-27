"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { CheckCircle, Loader2 } from "lucide-react";

/**
 * Страница после успешной оплаты по публичной ссылке.
 * Polling статуса — webhook от CP может прийти через 1-5 секунд.
 */

function SuccessContent() {
  const { orderId } = useParams<{ orderId: string }>();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [status, setStatus] = useState<"checking" | "paid" | "pending">("checking");
  const [offerTitle, setOfferTitle] = useState("");

  useEffect(() => {
    let attempts = 0;
    const poll = async () => {
      try {
        const res = await fetch(`/api/pay/${orderId}?token=${encodeURIComponent(token)}`);
        const data = await res.json();
        if (!data.success) return;

        setOfferTitle(data.data.offerTitle ?? "");
        if (data.data.status === "paid") {
          setStatus("paid");
        } else if (attempts++ < 15) {
          setTimeout(poll, 2000);
        } else {
          setStatus("pending");
        }
      } catch {}
    };
    poll();
  }, [orderId, token]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white border border-gray-200 rounded-3xl p-10 text-center shadow-sm">
        {status === "checking" && (
          <>
            <Loader2 className="w-12 h-12 animate-spin text-blue-500 mx-auto mb-4" />
            <h1 className="text-xl font-bold text-gray-900">Проверяем оплату…</h1>
            <p className="text-sm text-gray-500 mt-1">Это займёт несколько секунд</p>
          </>
        )}
        {status === "paid" && (
          <>
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
              <CheckCircle className="w-10 h-10 text-green-500" />
            </div>
            <h1 className="text-2xl font-black text-gray-900 mb-2">Оплата прошла!</h1>
            {offerTitle && (
              <p className="text-sm text-gray-500">
                «{offerTitle}» теперь доступен в твоём кабинете на prrv.tech
              </p>
            )}
          </>
        )}
        {status === "pending" && (
          <>
            <Loader2 className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
            <h1 className="text-xl font-bold text-gray-900 mb-2">Платёж обрабатывается</h1>
            <p className="text-sm text-gray-500">
              Это может занять несколько минут. Доступ откроется автоматически.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default function PaySuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      }
    >
      <SuccessContent />
    </Suspense>
  );
}
