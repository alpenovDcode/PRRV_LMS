/**
 * lib/payments/cloudpayments/webhook.ts
 *
 * Парсинг и верификация вебхуков CloudPayments.
 *
 * Особенности CP:
 *   • Тело — application/x-www-form-urlencoded (НЕ JSON).
 *   • Подпись — HMAC-SHA256(raw_body, ApiSecret), base64, в заголовке X-Content-HMAC.
 *   • Типы событий: Check, Pay, Fail, Confirm, Refund, Recurrent.
 *   • Тип определяется по URL — мы используем query-параметр ?event=<type>
 *     при настройке вебхуков в личном кабинете CP, либо смотрим по полям
 *     payload'а. Здесь мы определяем тип через query event и fallback'имся
 *     на анализ полей.
 *   • Любой webhook ОЖИДАЕТ ответ JSON { "code": <int> }. code=0 — ok,
 *     другие — отклонение (для Check это «не пропускать платёж»).
 */

import { createHmac, timingSafeEqual } from "crypto";
import { CP_API_SECRET } from "./config";
import {
  WebhookVerificationError,
  type PaymentStatusResult,
} from "../types";

/** Тип события CP — определяем по query или по полям. */
export type CpEventType = "Check" | "Pay" | "Fail" | "Confirm" | "Refund" | "Recurrent";

// ─── Подпись ───────────────────────────────────────────────────────────────

function verifyHmac(rawBody: string, signatureHeader: string | undefined): boolean {
  if (!signatureHeader || !CP_API_SECRET) return false;

  const expected = createHmac("sha256", CP_API_SECRET).update(rawBody, "utf8").digest("base64");
  // Constant-time compare
  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// ─── Парсинг x-www-form-urlencoded ─────────────────────────────────────────

function parseFormBody(rawBody: string): Record<string, string> {
  const params = new URLSearchParams(rawBody);
  const out: Record<string, string> = {};
  params.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

// ─── Определение типа события ──────────────────────────────────────────────

/**
 * CP позволяет настроить разные URL для разных типов событий, либо один
 * URL для всех. Мы поддерживаем оба варианта:
 *   • Если в query ?event=Pay → используем его.
 *   • Иначе угадываем по полям payload'а.
 */
export function detectEventType(
  url: string,
  payload: Record<string, string>
): CpEventType | null {
  // Query-параметр
  try {
    const eventQ = new URL(url).searchParams.get("event");
    if (eventQ) {
      const normalized = (eventQ.charAt(0).toUpperCase() + eventQ.slice(1).toLowerCase()) as CpEventType;
      if (
        ["Check", "Pay", "Fail", "Confirm", "Refund", "Recurrent"].includes(normalized)
      ) {
        return normalized;
      }
    }
  } catch {}

  // Эвристика по полям
  if (payload.Status === "Authorized" && payload.PaymentAmount) return "Pay";
  if (payload.Status === "Completed") return "Pay";
  if (payload.Status === "Declined" || payload.Reason) return "Fail";
  if (payload.OperationType === "Refund" || payload.PaymentTransactionId) return "Refund";
  if (payload.OperationType === "Confirm") return "Confirm";

  return null;
}

// ─── Маппинг статуса CP → наш PaymentStatus ────────────────────────────────

function mapStatus(eventType: CpEventType): PaymentStatusResult["status"] {
  switch (eventType) {
    case "Pay":
    case "Confirm":
      return "paid";
    case "Fail":
      return "cancelled";
    case "Refund":
      return "refunded";
    case "Check":
    case "Recurrent":
    default:
      return "pending";
  }
}

// ─── Основная функция ──────────────────────────────────────────────────────

/**
 * Парсит и верифицирует CP webhook.
 *
 *   • Если подпись невалидна → бросает WebhookVerificationError (handler ответит 401).
 *   • Если payload не выглядит как CP (нет ключевых полей) → возвращает null
 *     (handler ответит { ok: true } и проигнорирует).
 *   • Иначе возвращает PaymentStatusResult с ackResponse = { code: 0 }.
 */
export async function parseCpWebhook(
  rawBody: string,
  headers: Record<string, string>,
  requestUrl: string
): Promise<PaymentStatusResult | null> {
  // 1. HMAC verify
  const signature =
    headers["content-hmac"] ?? // CP отправляет именно X-Content-HMAC, lowercase ниже
    headers["x-content-hmac"];
  if (!verifyHmac(rawBody, signature)) {
    throw new WebhookVerificationError("Invalid HMAC signature");
  }

  // 2. Parse body
  const payload = parseFormBody(rawBody);
  if (!payload.TransactionId && !payload.PaymentTransactionId) {
    // Не наш формат
    return null;
  }

  // 3. Detect event type
  const eventType = detectEventType(requestUrl, payload);
  if (!eventType) {
    return null;
  }

  // 4. Map to PaymentStatusResult
  const transactionId = payload.TransactionId || payload.PaymentTransactionId;
  const amount = payload.Amount ?? payload.PaymentAmount;

  const result: PaymentStatusResult = {
    providerPaymentId: String(transactionId),
    // CP передаёт наш orderId через InvoiceId (мы прокидываем туда в createPayment).
    merchantOrderId: payload.InvoiceId || undefined,
    status: mapStatus(eventType),
    paymentMethod: deriveMethod(payload),
    raw: { ...payload, _eventType: eventType, _amount: amount },
    ackResponse: { code: 0 }, // CP требует именно такой формат
  };

  if (eventType === "Pay" || eventType === "Confirm") {
    result.paidAt = payload.DateTime
      ? new Date(payload.DateTime)
      : new Date();
  }

  return result;
}

function deriveMethod(payload: Record<string, string>): string | undefined {
  // CP передаёт CardType (Visa/MasterCard/Mir/etc) для карт; PaymentMethod для
  // не-карточных платежей (Sbp, Dolyame и т.д.).
  if (payload.PaymentMethod) {
    return payload.PaymentMethod.toLowerCase();
  }
  if (payload.CardType) {
    return `card:${payload.CardType.toLowerCase()}`;
  }
  return undefined;
}
