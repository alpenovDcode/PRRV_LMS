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

/** Интерфейс, который должен реализовать любой провайдер. */
export interface PaymentProvider {
  readonly name: string;
  createPayment(input: CreatePaymentInput): Promise<CreatedPayment>;
  getPaymentStatus(providerPaymentId: string): Promise<PaymentStatusResult>;
  /** Распарсить и верифицировать тело вебхука. Вернуть null если не наш вебхук. */
  parseWebhook(body: unknown, headers: Record<string, string>): Promise<PaymentStatusResult | null>;
}
