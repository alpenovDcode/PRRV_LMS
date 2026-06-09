"use client";

/**
 * /offer/[slug] — публичная страница оплаты оффера.
 *
 * Одна URL = много заказов. Каждый посетитель заполняет форму
 * (ФИО + email + телефон) и при сабмите получает свой Order. После
 * сабмита редирект на /pay/<orderId>?token=<...>, где он уже выбирает
 * метод оплаты (карта / СБП / ОТП / Freshcredit).
 *
 * UTM-параметры из URL прокидываются в API. На стороне БД они лягут в
 * ykSnapshot.utm и попадут в карточку заказа в админке для атрибуции.
 *
 * Honeypot-поле «website» скрыто CSS — настоящие пользователи его не
 * увидят, боты заполнят. Бэк silent-reject их без создания Order.
 */

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";

interface OfferData {
  id: string;
  title: string;
  description: string | null;
  price: string;
  oldPrice: string | null;
  currency: string;
  features: string[];
  accessDays: number | null;
}

function formatPrice(amount: string, currency: string) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(amount));
}

export default function PublicOfferPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [offer, setOffer] = useState<OfferData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState(""); // honeypot
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/offer/${slug}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setOffer(d.data);
        else setNotFound(true);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!consent) {
      setError("Подтвердите согласие на обработку данных");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        consent,
        website: website || undefined,
      };
      // UTM-метки из URL
      for (const k of [
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_content",
        "utm_term",
      ] as const) {
        const v = searchParams.get(k);
        if (v) payload[k] = v;
      }

      const res = await fetch(`/api/offer/${slug}/purchase`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok && data.success && data.data?.paymentUrl) {
        // Редиректим на страницу оплаты. На ней клиент видит метод
        // оплаты и завершает покупку.
        router.push(data.data.paymentUrl);
      } else {
        setError(data.error ?? "Не удалось создать заказ");
      }
    } catch {
      setError("Ошибка сети");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-white">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (notFound || !offer) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-50 p-6 text-center">
        <h1 className="text-2xl font-bold text-zinc-900 mb-2">
          Оффер недоступен
        </h1>
        <p className="text-zinc-600">
          Ссылка устарела или оффер временно отключён. Свяжитесь с менеджером.
        </p>
      </div>
    );
  }

  const hasDiscount = !!offer.oldPrice && Number(offer.oldPrice) > Number(offer.price);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-white">
      <div className="max-w-4xl mx-auto p-6 md:p-10">
        <div className="grid md:grid-cols-2 gap-8">
          {/* Левая колонка — про продукт */}
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-zinc-900 mb-3">
              {offer.title}
            </h1>
            {offer.description && (
              <p className="text-zinc-600 text-sm md:text-base mb-6 whitespace-pre-line">
                {offer.description}
              </p>
            )}

            {offer.features.length > 0 && (
              <ul className="space-y-2 mb-6">
                {offer.features.map((f, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-sm text-zinc-700"
                  >
                    <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex items-baseline gap-3 mb-1">
              <span className="text-3xl md:text-4xl font-bold text-zinc-900">
                {formatPrice(offer.price, offer.currency)}
              </span>
              {hasDiscount && offer.oldPrice && (
                <span className="text-lg text-zinc-400 line-through">
                  {formatPrice(offer.oldPrice, offer.currency)}
                </span>
              )}
            </div>
            {offer.accessDays && (
              <p className="text-xs text-zinc-500">
                Доступ — {offer.accessDays} дн. с момента оплаты
              </p>
            )}
          </div>

          {/* Правая колонка — форма */}
          <div className="bg-white rounded-2xl shadow-lg p-6 border border-zinc-100">
            <h2 className="text-lg font-semibold text-zinc-900 mb-1">
              Оформление заказа
            </h2>
            <p className="text-xs text-zinc-500 mb-4">
              После сабмита откроется страница оплаты. Доступ к курсу
              откроется автоматически в течение пары минут.
            </p>

            <form onSubmit={handleSubmit} className="space-y-3">
              {/* honeypot — скрыт от пользователей, видим ботам */}
              <input
                type="text"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                style={{
                  position: "absolute",
                  left: "-9999px",
                  opacity: 0,
                  pointerEvents: "none",
                  height: 0,
                  width: 0,
                }}
                aria-hidden="true"
              />

              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1">
                  ФИО *
                </label>
                <input
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Иванов Иван Иванович"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1">
                  Email *
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="you@example.com"
                />
                <p className="text-[10px] text-zinc-400 mt-1">
                  На него придёт письмо с доступом к курсу
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1">
                  Телефон
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="+7 (000) 000-00-00"
                />
              </div>

              <label className="flex items-start gap-2 text-xs text-zinc-600 mt-2">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-0.5 shrink-0"
                  required
                />
                <span>
                  Согласен на обработку персональных данных и получение
                  писем по теме покупки.
                </span>
              </label>

              {error && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full mt-2 flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg px-4 py-2.5 transition-colors disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Создаём
                    заказ…
                  </>
                ) : (
                  <>Перейти к оплате</>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
