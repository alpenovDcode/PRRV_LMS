/**
 * lib/payments/mock-provider.ts
 *
 * Mock-провайдер для разработки и тестов.
 * Сразу возвращает «успех» — реальный шлюз не нужен.
 *
 * Включается когда PAYMENT_PROVIDER=mock (или переменная не задана).
 */

import { randomUUID } from "crypto";
import {
  WebhookVerificationError,
  type PaymentProvider,
  type CreatePaymentInput,
  type CreatedPayment,
  type PaymentStatusResult,
} from "./types";

export class MockPaymentProvider implements PaymentProvider {
  readonly name = "mock";

  async createPayment(input: CreatePaymentInput): Promise<CreatedPayment> {
    const id = `mock_${randomUUID()}`;
    // Редиректим на внутреннюю страницу симуляции оплаты
    const confirmationUrl =
      `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/payments/mock-pay` +
      `?orderId=${input.orderId}&paymentId=${id}&returnUrl=${encodeURIComponent(input.returnUrl)}`;

    return {
      providerPaymentId: id,
      confirmationUrl,
      status: "pending",
    };
  }

  async getPaymentStatus(providerPaymentId: string): Promise<PaymentStatusResult> {
    return {
      providerPaymentId,
      status: "pending",
      raw: { mock: true },
    };
  }

  async parseWebhook(
    body: unknown,
    headers: Record<string, string>
  ): Promise<PaymentStatusResult | null> {
    const b = body as any;
    if (!b?.mock_event) return null;

    // Даже в dev требуем shared-secret чтобы случайные POST не активировали
    // заказы. Секрет берётся из MOCK_WEBHOOK_SECRET env; если не задан —
    // ничего не принимаем.
    const expected = process.env.MOCK_WEBHOOK_SECRET;
    const provided = headers["x-mock-secret"];
    if (!expected || provided !== expected) {
      throw new WebhookVerificationError("Mock webhook secret mismatch");
    }

    return {
      providerPaymentId: String(b.payment_id ?? ""),
      status: (b.status ?? "paid") as PaymentStatusResult["status"],
      paidAt: new Date(),
      paymentMethod: "mock_card",
      raw: body,
    };
  }
}
