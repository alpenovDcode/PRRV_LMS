/**
 * lib/payments/types.ts
 *
 * Абстрактные типы платёжного модуля.
 * Конкретные провайдеры (ЮКасса, Т-Банк, …) реализуют интерфейс PaymentProvider.
 */

export type PaymentCurrency = "RUB" | "USD" | "EUR";

export type PaymentStatus =
  | "pending"             // создан, не оплачен
  | "waiting_for_capture" // холд
  | "paid"                // успешно оплачен
  | "cancelled"           // отменён
  | "refunded";           // возврат

/** Что хочет создать вызывающий код. */
export interface CreatePaymentInput {
  orderId: string;
  amount: number;            // в рублях (или нужной валюте), число с копейками: 1990.00
  currency: PaymentCurrency;
  description: string;       // показывается пользователю на странице оплаты
  returnUrl: string;         // куда вернуть после оплаты
  customerEmail?: string;
  customerPhone?: string;
  metadata?: Record<string, string>;
}

/** Что возвращает провайдер после создания платежа. */
export interface CreatedPayment {
  /** ID платежа на стороне провайдера */
  providerPaymentId: string;
  /** URL, на который нужно перенаправить пользователя */
  confirmationUrl: string;
  status: PaymentStatus;
}

/** Нормализованный статус платежа от провайдера. */
export interface PaymentStatusResult {
  providerPaymentId: string;
  status: PaymentStatus;
  paidAt?: Date;
  paymentMethod?: string;   // "bank_card" | "sbp" | "installments" | …
  /** Сырой объект от провайдера для записи в БД */
  raw: unknown;
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
   */
  parseWebhook(body: unknown, headers: Record<string, string>): Promise<PaymentStatusResult | null>;
}
