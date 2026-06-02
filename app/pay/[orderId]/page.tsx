"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Loader2, CheckCircle, ShieldCheck, CreditCard, AlertTriangle, Landmark } from "lucide-react";

/**
 * Публичная страница оплаты по ссылке от админа.
 * Open без авторизации, защищена через ?token=<paymentLinkToken>.
 *
 * Сценарии:
 *  - GET /api/pay/[orderId]?token= → infо заказа
 *  - Кнопка "Оплатить" → POST /api/pay/[orderId]/start?token=
 *      • если widget → грузим CP-скрипт, открываем виджет
 *      • если redirect → window.location.href
 *  - Если status=paid → показываем "Уже оплачено"
 */

interface OrderInfo {
  orderId: string;
  status: string;
  amount: string;
  currency: string;
  paidAt: string | null;
  offerTitle: string;
  offerDescription: string | null;
  customerName: string | null;
  /** Серверный флаг: подключен ли ОТП Банк (есть OTP_SHOP_CODE). */
  otpEnabled: boolean;
}

type PayMethod = "cloudpayments" | "otp";

function formatPrice(amount: string, currency: string) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(amount));
}

function PayContent() {
  const { orderId } = useParams<{ orderId: string }>();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [order, setOrder] = useState<OrderInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  // Активный «крутящийся» метод — чтобы не блокировать одновременно обе
  // кнопки, когда пользователь кликнул конкретную.
  const [paying, setPaying] = useState<PayMethod | null>(null);
  const [error, setError] = useState("");
  /** После клика «ОТП» — клиент уехал в smart-form, на нашей странице
   * показываем сообщение «заявка отправлена в банк, ждём решение». */
  const [otpStarted, setOtpStarted] = useState(false);

  useEffect(() => {
    fetch(`/api/pay/${orderId}?token=${encodeURIComponent(token)}`)
      .then((r) => {
        if (r.status === 404) {
          setNotFound(true);
          return null;
        }
        return r.json();
      })
      .then((d) => {
        if (d?.success) setOrder(d.data);
        else if (d) setError(d.error ?? "Не удалось загрузить заказ");
      })
      .catch(() => setError("Ошибка сети"))
      .finally(() => setLoading(false));
  }, [orderId, token]);

  const handlePay = async (method: PayMethod = "cloudpayments") => {
    setPaying(method);
    setError("");
    try {
      const qs = new URLSearchParams({ token });
      if (method !== "cloudpayments") qs.set("method", method);
      const res = await fetch(
        `/api/pay/${orderId}/start?${qs.toString()}`,
        { method: "POST" }
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error ?? "Не удалось создать платёж");
        setPaying(null);
        return;
      }

      if (data.data.alreadyPaid) {
        // Перезагружаем чтобы показать "оплачено"
        window.location.reload();
        return;
      }

      if (data.data.kind === "redirect") {
        // ОТП открываем в новой вкладке, чтобы клиент мог вернуться на нашу
        // страницу и увидеть статус заявки. Остальных redirect-провайдеров
        // (если появятся) — переходим в той же вкладке.
        if (method === "otp") {
          window.open(data.data.confirmationUrl, "_blank", "noopener,noreferrer");
          setOtpStarted(true);
          setPaying(null);
        } else {
          window.location.href = data.data.confirmationUrl;
        }
        return;
      }

      if (data.data.kind === "widget" && data.data.widget === "cloudpayments") {
        await openCloudPaymentsWidget(data.data.params, data.data.paymentType);
        return;
      }

      setError("Неизвестный тип ответа от платёжного провайдера");
    } catch {
      setError("Ошибка сети");
    } finally {
      setPaying(null);
    }
  };

  async function openCloudPaymentsWidget(
    params: Record<string, unknown>,
    paymentType?: "charge" | "auth"
  ) {
    const SRC = "https://widget.cloudpayments.ru/bundles/cloudpayments.js";
    if (!document.querySelector(`script[src="${SRC}"]`)) {
      await new Promise<void>((resolve, reject) => {
        const s = document.createElement("script");
        s.src = SRC;
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error("Не удалось загрузить CloudPayments"));
        document.head.appendChild(s);
      });
    }
    const cp = (window as any).cp;
    if (!cp?.CloudPayments) throw new Error("CloudPayments SDK не доступен");

    const widget = new cp.CloudPayments();
    widget.pay(paymentType ?? "charge", params, {
      onSuccess: () => {
        window.location.href = `/pay/${orderId}/success?token=${encodeURIComponent(token)}`;
      },
      onFail: (reason: string) => {
        setError(`Платёж не прошёл: ${reason}`);
        setPaying(null);
      },
      onComplete: () => {},
    });
  }

  // ── States ────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (notFound || (!order && !error)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="max-w-md bg-white border border-gray-200 rounded-2xl p-8 text-center shadow-sm">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-7 h-7 text-gray-400" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Ссылка недоступна</h1>
          <p className="text-sm text-gray-500">
            Ссылка устарела или была введена с ошибкой. Свяжись с менеджером для получения новой.
          </p>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="max-w-md bg-white border border-gray-200 rounded-2xl p-8 text-center shadow-sm">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      </div>
    );
  }

  if (order.status === "paid") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="max-w-md bg-white border border-gray-200 rounded-2xl p-8 text-center shadow-sm">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-500" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Заказ оплачен</h1>
          <p className="text-sm text-gray-500 mb-1">{order.offerTitle}</p>
          <p className="text-3xl font-black text-gray-900 mt-3">
            {formatPrice(order.amount, order.currency)}
          </p>
          {order.paidAt && (
            <p className="text-xs text-gray-400 mt-2">
              {new Date(order.paidAt).toLocaleString("ru-RU")}
            </p>
          )}
        </div>
      </div>
    );
  }

  if (order.status === "refunded" || order.status === "cancelled") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="max-w-md bg-white border border-gray-200 rounded-2xl p-8 text-center shadow-sm">
          <p className="text-sm text-gray-500">
            Заказ {order.status === "refunded" ? "возвращён" : "отменён"}. Свяжись с менеджером.
          </p>
        </div>
      </div>
    );
  }

  // ── Active payment screen ─────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full">
        <div className="bg-white border border-gray-200 rounded-3xl p-8 shadow-sm">
          {order.customerName && (
            <p className="text-sm text-gray-500 mb-1">
              {order.customerName}, привет 👋
            </p>
          )}
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{order.offerTitle}</h1>
          {order.offerDescription && (
            <p className="text-sm text-gray-500 mb-4">{order.offerDescription}</p>
          )}

          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 rounded-2xl p-5 my-6 text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">К оплате</p>
            <p className="text-4xl font-black text-gray-900">
              {formatPrice(order.amount, order.currency)}
            </p>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 mb-4">
              {error}
            </div>
          )}

          {/* Информационная плашка про статус заявки в ОТП */}
          {otpStarted && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
              <div className="font-medium mb-0.5">Заявка отправлена в ОТП Банк</div>
              <div className="text-xs text-blue-700">
                Заполни анкету в открывшейся вкладке. После одобрения и подписания
                договора доступ откроется автоматически — мы пришлём письмо.
              </div>
            </div>
          )}

          {/* Основная кнопка — CloudPayments (карта / СБП / Долями / Рассрочка CP) */}
          <button
            onClick={() => handlePay("cloudpayments")}
            disabled={!!paying}
            className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2 text-lg shadow-lg shadow-blue-500/25"
          >
            {paying === "cloudpayments" ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" /> Переходим к оплате…
              </>
            ) : (
              <>
                <CreditCard className="w-5 h-5" /> Оплатить
              </>
            )}
          </button>

          <div className="mt-5 flex flex-wrap gap-2 justify-center">
            {["Карта РФ / не РФ", "СБП", "Долями", "Рассрочка"].map((m) => (
              <span
                key={m}
                className="text-xs text-gray-500 bg-gray-50 border border-gray-200 px-2.5 py-1 rounded-md"
              >
                {m}
              </span>
            ))}
          </div>

          {/* Альтернатива — ОТП Банк (кредит / рассрочка). Показываем, только
              если на сервере подключён OTP_SHOP_CODE. */}
          {order.otpEnabled && (
            <>
              <div className="flex items-center gap-3 my-6">
                <div className="flex-1 h-px bg-gray-200" />
                <span className="text-xs text-gray-400 uppercase tracking-wide">или</span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>

              <button
                onClick={() => handlePay("otp")}
                disabled={!!paying}
                className="w-full py-4 bg-white hover:bg-gray-50 text-gray-900 font-semibold rounded-xl border-2 border-gray-200 hover:border-emerald-400 transition-colors disabled:opacity-50 flex items-center justify-center gap-2.5"
              >
                {paying === "otp" ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" /> Открываем заявку…
                  </>
                ) : (
                  <>
                    <Landmark className="w-5 h-5 text-emerald-600" />
                    В кредит или рассрочку (ОТП Банк)
                  </>
                )}
              </button>
              <p className="mt-2 text-xs text-gray-500 text-center">
                Решение за пару минут · от 6 до 36 месяцев · без первого взноса
              </p>
            </>
          )}

          <div className="flex items-center gap-1.5 justify-center mt-4 text-xs text-gray-400">
            <ShieldCheck className="w-3.5 h-3.5 text-green-500" />
            Защищённая оплата · CloudPayments {order.otpEnabled && "· ОТП Банк"}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PayPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      }
    >
      <PayContent />
    </Suspense>
  );
}
