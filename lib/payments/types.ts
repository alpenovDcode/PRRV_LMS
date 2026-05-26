/**
 * lib/payments/types.ts
 *
 * Абстрактные типы платёжного модуля.
 * Конкретные провайдеры (CloudPayments, ЮКасса, Т-Банк, …) реализуют
 * интерфейс PaymentProvider.
 *
 * Поддерживаем два способа доставки пользователя к оплате:
 *   - "redirect" → редиректим на форму провайдера (ЮКасса, Т-Банк, mock)
 *   - "widget"   → открываем JS-виджет провайдера на нашей странице
 *                  (CloudPayments)
 */

export type PaymentCurrency = "RUB" | "USD" | "EUR";

export type PaymentStatus =
  | "pending"             // создан, не оплачен
  | "waiting_for_capture" // холд (для двухстадийной схемы)
  | "paid"                // успешно оплачен
  | "cancelled"           // отменён
  | "refunded";           // возврат

/** Что хочет создать вызывающий код. */
export interface CreatePaymentInput {
  orderId: string;
  amount: number;            // в рублях, число с копейками: 1990.00
  currency: PaymentCurrency;
  description: string;       // показывается пользователю на странице оплаты
  /** Куда вернуть после оплаты (для redirect-flow или success-страницы виджета) */
  returnUrl: string;
  customerEmail?: string;
  customerPhone?: string;
  /** Внутренний user ID для биндинга подписки/recurring */
  customerAccountId?: string;
  metadata?: Record<string, string>;
}

// ─── Result: redirect ИЛИ widget ───────────────────────────────────────────

/** Provider, который требует редиректа пользователя на свою форму. */
export interface RedirectPayment {
  kind: "redirect";
  providerPaymentId: string;
  confirmationUrl: string;
  status: PaymentStatus;
}

/**
 * Provider, который открывает JS-виджет на нашей странице.
 * Серверный код возвращает фронту параметры виджета — фронт сам грузит
 * скрипт провайдера и вызывает start().
 */
export interface WidgetPayment {
  kind: "widget";
  providerPaymentId: string;
  status: PaymentStatus;
  /** Имя виджета — фронт по нему выбирает обработчик */
  widget: "cloudpayments";
  /** Параметры для widget.start() — структура зависит от провайдера */
  params: Record<string, unknown>;
}

export type CreatedPayment = RedirectPayment | WidgetPayment;

// ─── Status / webhook ─────────────────────────────────────────────────────

/** Нормализованный статус платежа от провайдера. */
export interface PaymentStatusResult {
  /** ID транзакции на стороне провайдера. Сохраняется в БД для последующих lookup. */
  providerPaymentId: string;
  /**
   * Наш orderId — если провайдер вернул его в payload'е (например через CP
   * InvoiceId). Используется чтобы найти заказ при первом webhook'е, когда
   * providerPaymentId на нашей стороне ещё не сохранён.
   */
  merchantOrderId?: string;
  status: PaymentStatus;
  paidAt?: Date;
  paymentMethod?: string;   // "bank_card" | "sbp" | "installments" | …
  /** Сырой объект от провайдера для записи в БД */
  raw: unknown;
  /**
   * Опционально: код ответа который webhook handler должен вернуть провайдеру.
   * CloudPayments ожидает { code: 0 } для подтверждения Check/Pay/etc.
   * Если undefined — обработчик отвечает дефолтным { ok: true }.
   */
  ackResponse?: Record<string, unknown>;
}

/**
 * Бросается реализацией parseWebhook когда подпись/HMAC невалидна.
 * Обработчик /api/payments/webhook ловит это исключение и отвечает 401
 * без подробностей наружу.
 */
export class WebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookVerificationError";
  }
}

/** Интерфейс, который должен реализовать любой провайдер. */
export interface PaymentProvider {
  readonly name: string;
  createPayment(input: CreatePaymentInput): Promise<CreatedPayment>;
  getPaymentStatus(providerPaymentId: string): Promise<PaymentStatusResult>;
  /**
   * Парсит и верифицирует тело вебхука.
   *
   * Контракт:
   *   • Если подпись/HMAC невалидна — бросает WebhookVerificationError.
   *   • Если тело явно не наш вебхук (тестовый пинг, чужой провайдер) — вернуть null.
   *   • Если всё ок — вернуть PaymentStatusResult с нормализованным статусом.
   *
   * Реализации НЕ должны выполнять тяжёлую работу до верификации подписи.
   *
   * @param rawBody  Сырое тело запроса как строка (для HMAC). Может быть
   *                 JSON или form-urlencoded в зависимости от провайдера.
   * @param headers  Заголовки запроса (для извлечения подписи).
   */
  parseWebhook(rawBody: string, headers: Record<string, string>): Promise<PaymentStatusResult | null>;
}
