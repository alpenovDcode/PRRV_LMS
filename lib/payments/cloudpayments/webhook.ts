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
export type CpEventType = "Check" | "Pay" | "Fail" | "Confirm" | "Refund" | "Recurrent" | "Receipt";

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
 *   • Если в query ?event=Pay → используем его (ЕДИНСТВЕННЫЙ надёжный сигнал).
 *   • Если query нет — консервативная эвристика по полям, БЕЗ активации
 *     заказа по одному только Status=Completed (см. историю ниже).
 *
 * История бага: раньше был fallback `Status === "Completed" → Pay`. Но CP
 * присылает `Status=Completed` внутри Check-payload'а (это состояние
 * авторизации карты на момент проверки, а не финальное списание).
 * В результате Check ошибочно определялся как Pay и заказ активировался
 * без реальных денег. Инцидент 20.07.2026: заказ d4d94f6c-...
 */
export function detectEventType(
  url: string,
  payload: Record<string, string>
): CpEventType | null {
  try {
    const eventQ = new URL(url).searchParams.get("event");
    if (eventQ) {
      const normalized = (eventQ.charAt(0).toUpperCase() + eventQ.slice(1).toLowerCase()) as CpEventType;
      if (
        ["Check", "Pay", "Fail", "Confirm", "Refund", "Recurrent", "Receipt"].includes(normalized)
      ) {
        return normalized;
      }
    }
  } catch {}

  // Fallback без query: доверяем только явным маркерам, которые НЕ могут
  // прийти в Check.
  // Receipt-webhook уникален полем fnUrl (ссылка на чек в ОФД) — его нет ни
  // в Check, ни в Pay. Идентифицируем по этому маркеру.
  if (payload.fnUrl || payload.DocumentNumber) return "Receipt";
  if (payload.OperationType === "Refund" || payload.PaymentTransactionId) return "Refund";
  if (payload.OperationType === "Confirm") return "Confirm";
  if (payload.Status === "Declined" || payload.Reason) return "Fail";

  // Если query event отсутствует и мы не уверены — ЛОГИРУЕМ и возвращаем null.
  // Handler ответит { ok: true } и просто ничего не сделает. Лучше пропустить
  // событие и разобраться руками, чем ложно активировать заказ.
  console.warn(
    "[cp-webhook] событие пришло без ?event= в URL и без явных Pay-маркеров — " +
      "пропускаем; настройте в кабинете CloudPayments отдельные URL для Check/Pay/Fail/Refund"
  );
  return null;
}

// ─── Маппинг статуса CP → наш PaymentStatus ────────────────────────────────

/**
 * Маппинг типа события CP в наш PaymentStatus.
 *
 * Важный нюанс по Pay-событию:
 *   • Single-схема (одностадийная): CP шлёт Pay с Status=Completed —
 *     деньги списаны → "paid", активируем заказ.
 *   • Dual-схема (двухстадийная): CP шлёт Pay с Status=Authorized —
 *     это только холд, деньги в банке клиента, но НЕ у мерчанта.
 *     Активировать заказ нельзя: клиент получит курс без реальной оплаты,
 *     а холд через 7 дней истечёт. Ждём Confirm-event.
 *   • Confirm в Dual: холд подтверждён, деньги у мерчанта → "paid".
 */
function mapStatus(
  eventType: CpEventType,
  payload: Record<string, string>
): PaymentStatusResult["status"] {
  switch (eventType) {
    case "Pay":
      if (payload.Status === "Authorized") return "waiting_for_capture";
      return "paid";
    case "Confirm":
      return "paid";
    case "Fail":
      return "cancelled";
    case "Refund":
      return "refunded";
    case "Receipt":
      // Уведомление о фискализации в ОФД. НЕ платёжное — статус заказа
      // не меняет; webhook handler запишет fnUrl в snapshot.receipts[].
      return "pending";
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
  requestUrl: string | undefined
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
  // Receipt-webhook приходит в другом формате: TransactionId может отсутствовать,
  // зато есть fnUrl или DocumentNumber. Не отсекаем такие payload'ы.
  if (
    !payload.TransactionId &&
    !payload.PaymentTransactionId &&
    !payload.fnUrl &&
    !payload.DocumentNumber
  ) {
    // Не наш формат
    return null;
  }

  // 3. Detect event type. Если URL не пришёл — используем localhost, эвристика
  //    по payload'у работает как fallback (см. detectEventType).
  const eventType = detectEventType(requestUrl ?? "https://localhost/", payload);
  if (!eventType) {
    return null;
  }

  // 4. Map to PaymentStatusResult
  // Для Receipt в поле Id приходит TransactionId связанного платежа.
  const transactionId =
    payload.TransactionId || payload.PaymentTransactionId || payload.Id;
  const amount = payload.Amount ?? payload.PaymentAmount;

  const result: PaymentStatusResult = {
    providerPaymentId: String(transactionId),
    // CP передаёт наш orderId через InvoiceId (мы прокидываем туда в createPayment).
    merchantOrderId: payload.InvoiceId || undefined,
    status: mapStatus(eventType, payload),
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
