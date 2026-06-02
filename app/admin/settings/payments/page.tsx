"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Save,
  CheckCircle,
  AlertTriangle,
  Loader2,
  CreditCard,
  Landmark,
  Copy,
} from "lucide-react";

interface PaymentSettings {
  id: string;
  receiptEnabled: boolean;
  taxationSystem: number;
  vat: number;
  method: number;
  object: number;
  restrictedMethods: string[];
  paymentSchema: "Single" | "Dual";
  updatedAt: string;
}

/**
 * Публичная информация о подключении ОТП Банка. Секреты (shopCode, логин,
 * пароль) хранятся в env и сюда НЕ попадают — отдаём только маскированный
 * shopCode, IP whitelist, наш webhook URL и флаги «настроено / нет».
 */
interface OtpStatus {
  enabled: boolean;
  shopCodeMasked: string | null;
  category: string;
  creditType: string;
  restConfigured: boolean;
  webhookIps: string[];
  webhookUrl: string;
}

// ─── Пресеты систем налогообложения ────────────────────────────────────────

interface TaxPreset {
  key: string;
  label: string;
  description: string;
  taxationSystem: number;
  vat: number;
}

const TAX_PRESETS: TaxPreset[] = [
  {
    key: "osn",
    label: "ОСН (общая)",
    description: "НДС 20%",
    taxationSystem: 0,
    vat: 20,
  },
  {
    key: "usn-income",
    label: "УСН «Доходы»",
    description: "Без НДС, 6% с выручки",
    taxationSystem: 1,
    vat: 0,
  },
  {
    key: "usn-incexp",
    label: "УСН «Доходы минус расходы»",
    description: "Без НДС, 15% с прибыли",
    taxationSystem: 2,
    vat: 0,
  },
  {
    key: "envd",
    label: "ЕНВД",
    description: "Без НДС (если ещё действует)",
    taxationSystem: 3,
    vat: 0,
  },
  {
    key: "esn",
    label: "ЕСХН",
    description: "Сельхозналог, без НДС",
    taxationSystem: 4,
    vat: 0,
  },
  {
    key: "patent",
    label: "Патент / Самозанятый",
    description: "Без НДС",
    taxationSystem: 5,
    vat: 0,
  },
];

const PAYMENT_METHODS = [
  { value: "Card", label: "Карты РФ + Pay-сервисы" },
  { value: "ForeignCard", label: "Зарубежные карты" },
  { value: "Sbp", label: "СБП" },
  { value: "Dolyame", label: "Долями" },
  { value: "TcsInstallment", label: "Рассрочка Т-Банк" },
  { value: "TinkoffPay", label: "TinkoffPay" },
  { value: "SberPay", label: "SberPay" },
  { value: "MirPay", label: "MirPay" },
];

const METHOD_OPTIONS = [
  { value: 1, label: "Предоплата 100%" },
  { value: 2, label: "Предоплата" },
  { value: 3, label: "Аванс" },
  { value: 4, label: "Полный расчёт" },
  { value: 5, label: "Частичный расчёт + кредит" },
  { value: 6, label: "Передача в кредит" },
  { value: 7, label: "Оплата кредита" },
];

const OBJECT_OPTIONS = [
  { value: 1, label: "Товар" },
  { value: 2, label: "Подакцизный товар" },
  { value: 3, label: "Работа" },
  { value: 4, label: "Услуга" },
  { value: 5, label: "Ставка азартной игры" },
  { value: 6, label: "Выигрыш азартной игры" },
  { value: 7, label: "Лотерейный билет" },
  { value: 8, label: "Выигрыш лотереи" },
  { value: 9, label: "Предоставление прав на РИД" },
  { value: 10, label: "Платёж (аванс/задаток)" },
  { value: 11, label: "Агентское вознаграждение" },
  { value: 12, label: "Составной предмет расчёта" },
  { value: 13, label: "Иной предмет расчёта" },
];

// ─── Page ──────────────────────────────────────────────────────────────────

export default function PaymentSettingsPage() {
  const [settings, setSettings] = useState<PaymentSettings | null>(null);
  const [otp, setOtp] = useState<OtpStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // Local state для каждого поля
  const [receiptEnabled, setReceiptEnabled] = useState(true);
  const [taxationSystem, setTaxationSystem] = useState(1);
  const [vat, setVat] = useState(0);
  const [method, setMethod] = useState(4);
  const [object, setObject] = useState(4);
  const [restrictedMethods, setRestrictedMethods] = useState<string[]>([]);
  const [paymentSchema, setPaymentSchema] = useState<"Single" | "Dual">("Single");
  const [advancedMode, setAdvancedMode] = useState(false);

  useEffect(() => {
    fetch("/api/admin/payment-settings")
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          const s: PaymentSettings = d.data;
          setSettings(s);
          setReceiptEnabled(s.receiptEnabled);
          setTaxationSystem(s.taxationSystem);
          setVat(s.vat);
          setMethod(s.method);
          setObject(s.object);
          setRestrictedMethods(s.restrictedMethods);
          setPaymentSchema(s.paymentSchema);
          if (d.otp) setOtp(d.otp as OtpStatus);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  // Найти активный пресет на основе текущих taxationSystem + vat
  const activePresetKey =
    TAX_PRESETS.find((p) => p.taxationSystem === taxationSystem && p.vat === vat)?.key ?? null;

  const handlePresetSelect = (preset: TaxPreset) => {
    setTaxationSystem(preset.taxationSystem);
    setVat(preset.vat);
  };

  const toggleMethod = (m: string) => {
    setRestrictedMethods((prev) =>
      prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/payment-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receiptEnabled,
          taxationSystem,
          vat,
          method,
          object,
          restrictedMethods,
          paymentSchema,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSettings(data.data);
        setToast({ kind: "ok", text: "Сохранено" });
      } else {
        setToast({ kind: "err", text: data.error ?? "Не удалось сохранить" });
      }
    } catch {
      setToast({ kind: "err", text: "Ошибка сети" });
    } finally {
      setSaving(false);
      setTimeout(() => setToast(null), 4000);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      <Link
        href="/admin/settings"
        className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
      >
        <ArrowLeft className="w-4 h-4" /> Настройки
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <CreditCard className="w-6 h-6 text-blue-500" /> Платежи
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Параметры чека 54-ФЗ, методы оплаты, схема расчёта. Изменения применяются сразу.
        </p>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`p-3 rounded-lg text-sm border flex items-center gap-2 ${
            toast.kind === "ok"
              ? "bg-green-50 text-green-700 border-green-200"
              : "bg-red-50 text-red-700 border-red-200"
          }`}
        >
          {toast.kind === "ok" ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {toast.text}
        </div>
      )}

      {/* Receipt toggle */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={receiptEnabled}
            onChange={(e) => setReceiptEnabled(e.target.checked)}
            className="mt-1"
          />
          <div className="flex-1">
            <div className="font-medium text-gray-900">Передавать чек 54-ФЗ в виджет</div>
            <div className="text-xs text-gray-500 mt-0.5">
              CloudPayments сам сформирует фискальный чек и отправит клиенту на email.{" "}
              <strong className="text-red-600">Юридически обязательно в РФ.</strong>
            </div>
          </div>
        </label>
      </div>

      {/* Tax presets */}
      {receiptEnabled && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="font-semibold text-gray-900">Система налогообложения</h2>
              <p className="text-xs text-gray-500 mt-0.5">Выбери пресет под свою СН</p>
            </div>
            <button
              onClick={() => setAdvancedMode((s) => !s)}
              className="text-xs text-blue-600 hover:underline"
            >
              {advancedMode ? "Скрыть параметры" : "Ручной режим"}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {TAX_PRESETS.map((preset) => {
              const active = activePresetKey === preset.key;
              return (
                <button
                  key={preset.key}
                  onClick={() => handlePresetSelect(preset)}
                  className={`text-left p-3 rounded-lg border transition-all ${
                    active
                      ? "border-blue-500 bg-blue-50 ring-2 ring-blue-200"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                >
                  <div className="font-medium text-sm text-gray-900">{preset.label}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{preset.description}</div>
                </button>
              );
            })}
          </div>

          {advancedMode && (
            <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                  taxationSystem (числовой код)
                </label>
                <input
                  type="number"
                  value={taxationSystem}
                  onChange={(e) => setTaxationSystem(parseInt(e.target.value) || 0)}
                  min={0}
                  max={5}
                  className="w-32 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <p className="text-[10px] text-gray-400 mt-1">
                  0=ОСН, 1=УСН-Д, 2=УСН-ДР, 3=ЕНВД, 4=ЕСХН, 5=Патент
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                  НДС
                </label>
                <div className="flex gap-2">
                  {[0, 10, 20].map((v) => (
                    <button
                      key={v}
                      onClick={() => setVat(v)}
                      className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                        vat === v
                          ? "bg-blue-50 text-blue-700 border-blue-300"
                          : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      {v === 0 ? "Без НДС" : `${v}%`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                    Способ расчёта (method)
                  </label>
                  <select
                    value={method}
                    onChange={(e) => setMethod(parseInt(e.target.value))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    {METHOD_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.value} — {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                    Предмет расчёта (object)
                  </label>
                  <select
                    value={object}
                    onChange={(e) => setObject(parseInt(e.target.value))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    {OBJECT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.value} — {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Payment schema */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="font-semibold text-gray-900 mb-3">Схема оплаты</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            onClick={() => setPaymentSchema("Single")}
            className={`text-left p-3 rounded-lg border transition-all ${
              paymentSchema === "Single"
                ? "border-blue-500 bg-blue-50 ring-2 ring-blue-200"
                : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <div className="font-medium text-sm text-gray-900">Single (одностадийная)</div>
            <div className="text-xs text-gray-500 mt-0.5">
              Деньги списываются сразу. Стандарт для курсов.
            </div>
          </button>
          <button
            onClick={() => setPaymentSchema("Dual")}
            className={`text-left p-3 rounded-lg border transition-all ${
              paymentSchema === "Dual"
                ? "border-blue-500 bg-blue-50 ring-2 ring-blue-200"
                : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <div className="font-medium text-sm text-gray-900">Dual (холд + confirm)</div>
            <div className="text-xs text-gray-500 mt-0.5">
              Блокировка суммы, ручное подтверждение в течение 7 дней.
            </div>
          </button>
        </div>
      </div>

      {/* Restricted methods */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="font-semibold text-gray-900 mb-1">Скрыть методы оплаты в виджете</h2>
        <p className="text-xs text-gray-500 mb-3">
          Отметь те, которые НЕ хочешь показывать клиенту. Пусто = все доступные методы видны.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {PAYMENT_METHODS.map((m) => {
            const hidden = restrictedMethods.includes(m.value);
            return (
              <label
                key={m.value}
                className="flex items-center gap-2 p-2 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={hidden}
                  onChange={() => toggleMethod(m.value)}
                />
                <div className="text-sm">
                  <span className={hidden ? "text-gray-400 line-through" : "text-gray-900"}>
                    {m.label}
                  </span>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {/* ─── ОТП Банк ─────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <Landmark className="w-5 h-5 text-emerald-600" /> ОТП Банк
              <span className="text-xs font-normal text-gray-400">
                кредит и рассрочка
              </span>
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Альтернатива CloudPayments. Конфигурация в env (секреты не хранятся в БД).
            </p>
          </div>
          {otp?.enabled ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-green-50 text-green-700 border border-green-200">
              <CheckCircle className="w-3.5 h-3.5" /> Подключено
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-gray-100 text-gray-500 border border-gray-200">
              <AlertTriangle className="w-3.5 h-3.5" /> Не настроено
            </span>
          )}
        </div>

        {otp?.enabled ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <KV
                label="Shop Code"
                value={otp.shopCodeMasked ?? "—"}
                mono
              />
              <KV label="Категория товара" value={otp.category} mono />
              <KV
                label="Тип кредита"
                value={
                  otp.creditType === "1"
                    ? "1 — Кредит"
                    : otp.creditType === "2"
                    ? "2 — Кредит и рассрочка"
                    : otp.creditType === "3"
                    ? "3 — Рассрочка"
                    : otp.creditType
                }
              />
              <KV
                label="REST API"
                value={otp.restConfigured ? "Логин/пароль заданы" : "Не задано (опционально)"}
              />
              <div className="sm:col-span-2">
                <div className="text-xs text-gray-500 mb-1">IP whitelist webhook</div>
                {otp.webhookIps.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {otp.webhookIps.map((ip) => (
                      <span
                        key={ip}
                        className="text-xs font-mono bg-gray-50 border border-gray-200 px-2 py-0.5 rounded"
                      >
                        {ip}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-amber-700">
                    ⚠ OTP_WEBHOOK_IPS пуст — webhook принимает любые IP. На проде
                    задать обязательно.
                  </p>
                )}
              </div>
            </div>

            <div className="border-t border-gray-100 pt-3">
              <div className="text-xs text-gray-500 mb-1">Webhook URL для куратора ОТП</div>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs font-mono bg-gray-50 border border-gray-200 px-2.5 py-1.5 rounded break-all">
                  {otp.webhookUrl}
                </code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(otp.webhookUrl).catch(() => {});
                    setToast({ kind: "ok", text: "URL скопирован" });
                    setTimeout(() => setToast(null), 2000);
                  }}
                  className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
                  title="Скопировать"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="text-sm text-gray-600 bg-gray-50 border border-gray-100 rounded-lg p-4 space-y-2">
            <p>
              Чтобы подключить ОТП Банк, добавь в env переменные и пересобери
              приложение:
            </p>
            <ul className="font-mono text-xs space-y-0.5 ml-4 list-disc text-gray-700">
              <li>OTP_SHOP_CODE — обязательный, от куратора</li>
              <li>OTP_WEBHOOK_IPS — IP-адреса ОТП через запятую (защита)</li>
              <li>OTP_LOGIN / OTP_PASSWORD — опционально, для REST API</li>
              <li>OTP_CATEGORY — по умолчанию RGB_GOODS_CATEGORY_138 (образование)</li>
            </ul>
            <p className="text-xs text-gray-500 pt-1">
              После подключения передай куратору наш webhook URL и наш домен,
              чтобы они зарегистрировали интеграцию у себя.
            </p>
          </div>
        )}
      </div>

      {/* Save bar */}
      <div className="sticky bottom-4 flex items-center justify-between bg-white border border-gray-200 rounded-xl p-4 shadow-lg">
        <div className="text-xs text-gray-500">
          {settings?.updatedAt && (
            <>Последнее изменение: {new Date(settings.updatedAt).toLocaleString("ru-RU")}</>
          )}
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? "Сохраняю…" : "Сохранить"}
        </button>
      </div>
    </div>
  );
}

/** Маленький key/value-блок для read-only полей конфигурации провайдера. */
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
      <div
        className={`text-sm text-gray-900 ${mono ? "font-mono" : ""} truncate`}
      >
        {value}
      </div>
    </div>
  );
}
