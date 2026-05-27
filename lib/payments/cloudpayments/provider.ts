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
  RefundInput,
  RefundResult,
} from "../types";
import {
  CP_PUBLIC_ID,
  CP_API_BASE,
  cpBasicAuthHeader,
  assertCpConfig,
} from "./config";
import { getEffectivePaymentSettings } from "./settings";
import { parseCpWebhook } from "./webhook";

export class CloudPaymentsProvider implements PaymentProvider {
  readonly name = "cloudpayments";

  async createPayment(input: CreatePaymentInput): Promise<CreatedPayment> {
    assertCpConfig();

    // Эффективные настройки (БД > env > defaults). Кэшируются на 30 сек.
    const settings = await getEffectivePaymentSettings();

    // Параметры виджета. Структура — то, что widget.start() принимает напрямую.
    // Часть полей пробрасываем через invoiceId / accountId / data чтобы webhook
    // потом нашёл наш заказ.
    const params: Record<string, unknown> = {
      publicId: CP_PUBLIC_ID,
      description: input.description,
      amount: input.amount,
      currency: input.currency,
      invoiceId: input.orderId, // CP вернёт это в webhook как InvoiceId
      paymentSchema: settings.paymentSchema,
      // data — произвольный JSON, прилетает в webhook
      data: { orderId: input.orderId, ...(input.metadata ?? {}) },
    };

    if (input.customerAccountId) params.accountId = input.customerAccountId;
    if (input.customerEmail) params.email = input.customerEmail;
    if (settings.restrictedMethods.length > 0) {
      params.restrictedPaymentMethods = settings.restrictedMethods;
    }
    // returnUrl — куда уйти после успешной оплаты в виджете (опционально)
    if (input.returnUrl) params.successUrl = input.returnUrl;

    // ── Чек 54-ФЗ ────────────────────────────────────────────────────────
    // Передаётся в виджет через data.CloudPayments.CustomerReceipt. CP
    // сформирует чек и отправит на email клиента (если customerEmail задан).
    if (settings.receiptEnabled) {
      const items = input.receiptItems?.length
        ? input.receiptItems
        : [{ label: input.description.slice(0, 128), price: input.amount, quantity: 1 }];

      const receiptItems = items.map((it) => ({
        label: it.label.slice(0, 128),
        price: Number(it.price.toFixed(2)),
        quantity: it.quantity,
        amount: Number((it.price * it.quantity).toFixed(2)),
        vat: settings.vat,
        method: settings.method,
        object: settings.object,
      }));

      (params.data as Record<string, unknown>) = {
        ...((params.data as Record<string, unknown>) ?? {}),
        CloudPayments: {
          CustomerReceipt: {
            Items: receiptItems,
            taxationSystem: settings.taxationSystem,
            ...(input.customerEmail ? { email: input.customerEmail } : {}),
            ...(input.customerPhone ? { phone: input.customerPhone } : {}),
            isBso: false,
            amounts: {
              electronic: Number(input.amount.toFixed(2)),
              advancePayment: 0,
              credit: 0,
              provision: 0,
            },
          },
        },
      };
    }

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

  /**
   * Возврат через CloudPayments API.
   *
   * Endpoint: POST /payments/refund
   * Параметры:
   *   TransactionId — ID транзакции (наш ykPaymentId)
   *   Amount        — сумма возврата (опционально, если не передана — полный)
   *
   * CP возвращает Model с TransactionId возвратной операции и Status.
   * Если CP бросает ошибку — поле Success=false с Message.
   *
   * Идемпотентность: на стороне CP по TransactionId — повторный запрос
   * с тем же TransactionId после успешного refund вернёт ошибку, но это
   * норма (refund-order.ts выше уже проверяет, что заказ не refunded).
   */
  async refund(input: RefundInput): Promise<RefundResult> {
    assertCpConfig();

    const body: Record<string, unknown> = {
      TransactionId: Number(input.providerPaymentId),
    };
    if (input.amount != null) body.Amount = input.amount;

    const resp = await fetch(`${CP_API_BASE}/payments/refund`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: cpBasicAuthHeader(),
      },
      body: JSON.stringify(body),
    });

    const data: any = await resp.json().catch(() => ({}));
    if (!resp.ok || data?.Success === false) {
      const message = data?.Message ?? data?.Model?.CardHolderMessage ?? `HTTP ${resp.status}`;
      throw new Error(`CloudPayments refund failed: ${message}`);
    }

    const model = data?.Model ?? {};
    return {
      refundId: String(model.TransactionId ?? input.providerPaymentId),
      amount: Number(model.Amount ?? input.amount ?? 0),
      status: "refunded",
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
