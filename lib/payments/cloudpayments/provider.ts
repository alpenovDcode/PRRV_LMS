/**
 * lib/payments/cloudpayments/provider.ts
 *
 * CloudPaymentsProvider — реализация PaymentProvider через JS-виджет CP.
 *
 * Главное отличие от ЮКассы:
 *   • createPayment НЕ создаёт ничего на стороне CP заранее.
 *   • Виджет открывается на нашей странице с params, и в момент клика
 *     юзера фактически создаётся транзакция.
 *   • providerPaymentId фигурирует только в webhook (TransactionId).
 *   • Поэтому createPayment возвращает orderId как providerPaymentId
 *     (пока нет реального CP transaction id), а в БД он перезапишется
 *     при первом Check/Pay webhook'е.
 */

import type {
  PaymentProvider,
  CreatePaymentInput,
  CreatedPayment,
  PaymentStatusResult,
} from "../types";
import {
  CP_PUBLIC_ID,
  CP_PAYMENT_SCHEMA,
  CP_API_BASE,
  cpBasicAuthHeader,
  getRestrictedMethods,
  assertCpConfig,
} from "./config";
import { parseCpWebhook } from "./webhook";

export class CloudPaymentsProvider implements PaymentProvider {
  readonly name = "cloudpayments";

  async createPayment(input: CreatePaymentInput): Promise<CreatedPayment> {
    assertCpConfig();

    const restricted = getRestrictedMethods();

    // Параметры виджета. Структура — то, что widget.start() принимает напрямую.
    // Часть полей пробрасываем через invoiceId / accountId / data чтобы webhook
    // потом нашёл наш заказ.
    const params: Record<string, unknown> = {
      publicId: CP_PUBLIC_ID,
      description: input.description,
      amount: input.amount,
      currency: input.currency,
      invoiceId: input.orderId, // CP вернёт это в webhook как InvoiceId
      paymentSchema: CP_PAYMENT_SCHEMA,
      // data — произвольный JSON, прилетает в webhook
      data: { orderId: input.orderId, ...(input.metadata ?? {}) },
    };

    if (input.customerAccountId) params.accountId = input.customerAccountId;
    if (input.customerEmail) params.email = input.customerEmail;
    if (restricted.length > 0) params.restrictedPaymentMethods = restricted;
    // returnUrl — куда уйти после успешной оплаты в виджете (опционально)
    if (input.returnUrl) params.successUrl = input.returnUrl;

    return {
      kind: "widget",
      widget: "cloudpayments",
      // На этом этапе у нас ещё нет TransactionId. Используем orderId как
      // временный идентификатор — он перезапишется через webhook.
      providerPaymentId: input.orderId,
      status: "pending",
      params,
    };
  }

  /**
   * GET статус транзакции на стороне CP (для polling/админских кнопок).
   * Используем endpoint /payments/findbyinvoiceid либо /payments/get.
   */
  async getPaymentStatus(providerPaymentId: string): Promise<PaymentStatusResult> {
    // Если providerPaymentId — это наш orderId (createPayment fallback),
    // ищем по InvoiceId. Если уже реальный TransactionId — по нему.
    const isNumeric = /^\d+$/.test(providerPaymentId);
    const url = isNumeric
      ? `${CP_API_BASE}/payments/get`
      : `${CP_API_BASE}/payments/findbyinvoiceid`;

    const body = isNumeric
      ? { TransactionId: Number(providerPaymentId) }
      : { InvoiceId: providerPaymentId };

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: cpBasicAuthHeader(),
      },
      body: JSON.stringify(body),
    });
    const data: any = await resp.json().catch(() => ({}));

    const model = data?.Model ?? {};
    const status = mapCpStatusToOurs(String(model.Status ?? ""));

    return {
      providerPaymentId: String(model.TransactionId ?? providerPaymentId),
      status,
      paidAt: model.AuthDate ? new Date(model.AuthDate) : undefined,
      paymentMethod: model.CardType ? `card:${String(model.CardType).toLowerCase()}` : undefined,
      raw: data,
    };
  }

  async parseWebhook(
    rawBody: string,
    headers: Record<string, string>
  ): Promise<PaymentStatusResult | null> {
    // requestUrl используется только для определения типа события (?event=Pay).
    // Реальный URL придёт в /api/payments/webhook — но для type-detect ниже
    // достаточно пустой строки + payload-эвристики.
    return parseCpWebhook(rawBody, headers, "https://localhost/?event=");
  }
}

// ─── helpers ───────────────────────────────────────────────────────────────

function mapCpStatusToOurs(cpStatus: string): PaymentStatusResult["status"] {
  switch (cpStatus) {
    case "Completed":
      return "paid";
    case "Authorized":
      return "waiting_for_capture";
    case "Declined":
      return "cancelled";
    case "Refunded":
      return "refunded";
    case "AwaitingAuthentication":
    case "Cancelled":
    default:
      return "pending";
  }
}
