/**
 * lib/payments/cloudpayments/config.ts
 *
 * Конфигурация CloudPayments.
 *
 * Получи в личном кабинете CP (Настройки → Сайты → Реквизиты для API):
 *   CP_PUBLIC_ID   — Public ID (виден на фронте, передаётся в виджет)
 *   CP_API_SECRET  — API Secret (только сервер, HTTP Basic password + HMAC ключ)
 *
 * Опционально:
 *   CP_RESTRICTED_METHODS — comma-separated список методов которые нужно ОТКЛЮЧИТЬ
 *                           в виджете. Поддерживаемые: Card, ForeignCard, Sbp,
 *                           Dolyame, TcsInstallment, TinkoffPay, SberPay, MirPay
 *   CP_PAYMENT_SCHEMA     — "Single" (default) или "Dual"
 */

export const CP_PUBLIC_ID = process.env.CP_PUBLIC_ID || "";
export const CP_API_SECRET = process.env.CP_API_SECRET || "";

export type CpPaymentSchema = "Single" | "Dual";
export const CP_PAYMENT_SCHEMA: CpPaymentSchema =
  (process.env.CP_PAYMENT_SCHEMA as CpPaymentSchema) || "Single";

/** Парсим CP_RESTRICTED_METHODS — список запрещённых методов. */
export function getRestrictedMethods(): string[] {
  const raw = process.env.CP_RESTRICTED_METHODS || "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function assertCpConfig(): void {
  const missing: string[] = [];
  if (!CP_PUBLIC_ID) missing.push("CP_PUBLIC_ID");
  if (!CP_API_SECRET) missing.push("CP_API_SECRET");
  if (missing.length > 0) {
    throw new Error(`CloudPayments not configured: missing ${missing.join(", ")}`);
  }
}

// ─── Параметры чека 54-ФЗ ─────────────────────────────────────────────────
//
// Все параметры опциональные. Если CP_RECEIPT_ENABLED не задан или = "false",
// чек не передаётся в виджет (CP его не сформирует — будет нарушение 54-ФЗ).
//
// Системы налогообложения:
//   0 = ОСН (общая), 1 = УСН доходы, 2 = УСН доходы-расходы,
//   3 = ЕНВД, 4 = ЕСН (сельхозналог), 5 = Патентная
//
// НДС:
//   0 = "Без НДС" (для УСН/ПСН), 10 = 10%, 20 = 20%
//
// Method (признак способа расчёта):
//   1 = предоплата 100%, 2 = предоплата, 3 = аванс,
//   4 = полный расчёт (по умолчанию для разовых покупок курсов)
//
// Object (признак предмета расчёта):
//   1 = товар, 2 = подакцизный товар, 3 = работа, 4 = услуга (для курсов!)

export const CP_RECEIPT_ENABLED = process.env.CP_RECEIPT_ENABLED !== "false"; // default true
export const CP_RECEIPT_TAXATION_SYSTEM = parseInt(process.env.CP_RECEIPT_TAXATION_SYSTEM ?? "1"); // УСН доходы default
export const CP_RECEIPT_VAT = parseInt(process.env.CP_RECEIPT_VAT ?? "0"); // Без НДС default
export const CP_RECEIPT_METHOD = parseInt(process.env.CP_RECEIPT_METHOD ?? "4"); // полный расчёт
export const CP_RECEIPT_OBJECT = parseInt(process.env.CP_RECEIPT_OBJECT ?? "4"); // услуга

/** Endpoints API (для server-to-server вызовов: refund, void, get-status и т.п.) */
export const CP_API_BASE = "https://api.cloudpayments.ru";

/**
 * Возвращает HTTP Basic Authorization для серверных запросов к CP.
 * Используется в lib/payments/cloudpayments/api.ts (refund, getStatus).
 */
export function cpBasicAuthHeader(): string {
  const cred = Buffer.from(`${CP_PUBLIC_ID}:${CP_API_SECRET}`).toString("base64");
  return `Basic ${cred}`;
}
