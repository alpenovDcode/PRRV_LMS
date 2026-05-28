"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CheckCircle, ShieldCheck, CreditCard, Loader2, ArrowLeft, Clock, Tag } from "lucide-react";

interface Offer {
  id: string;
  title: string;
  description: string | null;
  price: string;
  oldPrice: string | null;
  currency: string;
  accessDays: number | null;
  features: string[];
  courses: { id: string; title: string; coverImage: string | null }[];
  tariff: string | null;
}

function formatPrice(price: string, currency: string) {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(price));
}

export default function CheckoutPage() {
  const { offerId } = useParams<{ offerId: string }>();
  const router = useRouter();

  const [offer, setOffer] = useState<Offer | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/offers/${offerId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setOffer(d.data);
        else setError("Оффер не найден");
      })
      .catch(() => setError("Ошибка загрузки"))
      .finally(() => setLoading(false));
  }, [offerId]);

  const handlePay = async () => {
    setPaying(true);
    setError("");
    try {
      const res = await fetch("/api/payments/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error ?? "Ошибка создания платежа");
        setPaying(false);
        return;
      }

      // Redirect-провайдеры (mock, ЮКасса) — просто уходим на их форму.
      if (data.data.kind === "redirect") {
        window.location.href = data.data.confirmationUrl;
        return;
      }

      // Widget-провайдер (CloudPayments) — грузим скрипт и открываем виджет
      // на нашей странице. После закрытия виджета редиректим на success.
      if (data.data.kind === "widget" && data.data.widget === "cloudpayments") {
        await openCloudPaymentsWidget(data.data.params, data.data.orderId, data.data.paymentType);
        return;
      }

      setError("Неизвестный тип ответа от платёжного провайдера");
    } catch {
      setError("Ошибка сети");
    } finally {
      setPaying(false);
    }
  };

  /**
   * Загружает CP-скрипт (idempotent) и открывает виджет с переданными params.
   * После закрытия (success/fail/cancel) ведёт юзера на /payments/success
   * — там polling статуса покажет финальный результат.
   */
  async function openCloudPaymentsWidget(
    params: Record<string, unknown>,
    orderId: string,
    paymentType?: "charge" | "auth"
  ): Promise<void> {
    // 1. Загружаем CP bundle если ещё не загружен
    const SRC = "https://widget.cloudpayments.ru/bundles/cloudpayments.js";
    if (!document.querySelector(`script[src="${SRC}"]`)) {
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement("script");
        script.src = SRC;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Не удалось загрузить CloudPayments"));
        document.head.appendChild(script);
      });
    }

    // 2. Открываем виджет
    const cp = (window as any).cp;
    if (!cp?.CloudPayments) {
      throw new Error("CloudPayments SDK не доступен");
    }
    const widget = new cp.CloudPayments();
    widget.pay(paymentType ?? "charge", params, {
      onSuccess: () => {
        window.location.href = `/payments/success?orderId=${orderId}`;
      },
      onFail: (reason: string) => {
        setError(`Платёж не прошёл: ${reason}`);
        setPaying(false);
      },
      onComplete: (_paymentResult: any, _options: any) => {
        // вызывается всегда после закрытия виджета. Состояние страницы
        // уже обработано в onSuccess/onFail.
      },
    });
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error && !offer) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-gray-500 mb-4">{error}</p>
          <button onClick={() => router.back()} className="text-blue-600 hover:underline flex items-center gap-1 mx-auto">
            <ArrowLeft className="w-4 h-4" /> Назад
          </button>
        </div>
      </div>
    );
  }

  if (!offer) return null;

  const price = formatPrice(offer.price, offer.currency);
  const oldPrice = offer.oldPrice ? formatPrice(offer.oldPrice, offer.currency) : null;
  const discount = offer.oldPrice
    ? Math.round((1 - Number(offer.price) / Number(offer.oldPrice)) * 100)
    : null;

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Шапка */}
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-8 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Назад
        </button>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
          {/* Левая колонка — состав заказа */}
          <div className="md:col-span-3 space-y-4">
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <h1 className="text-2xl font-bold text-gray-900 mb-1">{offer.title}</h1>
              {offer.description && (
                <p className="text-gray-500 text-sm mb-4">{offer.description}</p>
              )}

              {/* Что входит */}
              {offer.features.length > 0 && (
                <div className="mb-4 space-y-2">
                  {offer.features.map((f, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm text-gray-700">
                      <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                      {f}
                    </div>
                  ))}
                </div>
              )}

              {/* Курсы */}
              {offer.courses.length > 0 && (
                <div className="border-t border-gray-100 pt-4 mt-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Включённые курсы</p>
                  <div className="space-y-2">
                    {offer.courses.map((c) => (
                      <div key={c.id} className="flex items-center gap-3 text-sm text-gray-700">
                        {c.coverImage ? (
                          <img src={c.coverImage} alt="" className="w-10 h-10 rounded-lg object-cover" />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-400 to-indigo-500" />
                        )}
                        <span>{c.title}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Срок доступа */}
              {offer.accessDays && (
                <div className="flex items-center gap-2 mt-4 text-sm text-gray-500">
                  <Clock className="w-4 h-4" />
                  Доступ на {offer.accessDays} дней
                </div>
              )}
              {!offer.accessDays && (
                <div className="flex items-center gap-2 mt-4 text-sm text-gray-500">
                  <Clock className="w-4 h-4" />
                  Бессрочный доступ
                </div>
              )}

              {/* Тариф */}
              {offer.tariff && (
                <div className="flex items-center gap-2 mt-2 text-sm text-gray-500">
                  <Tag className="w-4 h-4" />
                  Тариф: <span className="font-semibold text-blue-600">{offer.tariff}</span>
                </div>
              )}
            </div>
          </div>

          {/* Правая колонка — итог и кнопка оплаты */}
          <div className="md:col-span-2 space-y-4">
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 sticky top-6">
              <p className="text-sm text-gray-400 uppercase tracking-wide font-semibold mb-3">Итого к оплате</p>

              <div className="flex items-end gap-3 mb-4">
                <span className="text-4xl font-black text-gray-900">{price}</span>
                {oldPrice && (
                  <div className="flex flex-col items-start">
                    <span className="text-lg text-gray-400 line-through">{oldPrice}</span>
                    {discount && (
                      <span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                        −{discount}%
                      </span>
                    )}
                  </div>
                )}
              </div>

              {error && (
                <p className="text-sm text-red-500 mb-3 p-2 bg-red-50 rounded-lg">{error}</p>
              )}

              <button
                onClick={handlePay}
                disabled={paying}
                className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2 text-lg shadow-lg shadow-blue-500/25"
              >
                {paying ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Переходим к оплате…</>
                ) : (
                  <><CreditCard className="w-5 h-5" /> Оплатить {price}</>
                )}
              </button>

              {/* Методы оплаты — иконки */}
              <div className="mt-4 flex flex-wrap gap-2 justify-center">
                {["Карта", "СБП", "Рассрочка"].map((m) => (
                  <span key={m} className="text-xs text-gray-400 bg-gray-50 border border-gray-200 px-2 py-1 rounded-md">
                    {m}
                  </span>
                ))}
              </div>

              <div className="flex items-center gap-2 mt-4 text-xs text-gray-400 justify-center">
                <ShieldCheck className="w-4 h-4 text-green-500" />
                Защищённая оплата
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
