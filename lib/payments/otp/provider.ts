/**
 * lib/payments/otp/provider.ts
 *
 * OtpPaymentProvider — реализация PaymentProvider для ОТП Банка
 * (smart-form, кредиты и рассрочки).
 *
 * Особенности:
 *   • Это redirect-провайдер: createPayment возвращает confirmationUrl
 *     на smart-form ОТП, который мы открываем в новой вкладке.
 *   • Эндпоинт /smart-form-link/v1/configurations публичный — авторизуется
 *     по shopCode в теле запроса. Bearer-токен не требуется.
 *   • Статус заказа приходит push'ем через webhook на каждую смену state
 *     заявки (10-15 событий за оформление). Активация заказа — только на
 *     state=AGREEMENT_PAID. Отказные state переводят заказ в cancelled.
 *   • getPaymentStatus реализован через REST «Просмотр БП» — резервный
 *     канал для админки на случай если webhook не дошёл.
 *   • refund через API на текущий момент не поддерживается. Возвраты по
 *     кредитному договору оформляются через банк (cм. OTP-X в TODO).
 */

import type {
  PaymentProvider,
  CreatePaymentInput,
  CreatedPayment,
  PaymentStatusResult,
  PaymentStatus,
  RefundInput,
  RefundResult,
} from "../types";
import {
  OTP_SHOP_CODE,
  OTP_CATEGORY,
  OTP_CREDIT_TYPE,
  OTP_API_BASE,
  OTP_SMART_FORM_BASE,
  assertOtpConfig,
} from "./config";
import { getAccessToken } from "./auth";

export class OtpPaymentProvider implements PaymentProvider {
  readonly name = "otp";

  async createPayment(input: CreatePaymentInput): Promise<CreatedPayment> {
    assertOtpConfig();

    // Передаём наш orderId в externalOrderId — он вернётся в webhook
    // и используется для матчинга заявки с заказом.
    //
    // goods — список позиций заказа. Если receiptItems заданы — мапим их;
    // иначе одна позиция на всю сумму с label = description.
    const goods =
      input.receiptItems && input.receiptItems.length > 0
        ? input.receiptItems.map((it) => ({
            name: it.label.slice(0, 256),
            category: OTP_CATEGORY,
            price: Number(it.price.toFixed(2)),
            quantity: it.quantity,
          }))
        : [
            {
              name: input.description.slice(0, 256),
              category: OTP_CATEGORY,
              price: Number(input.amount.toFixed(2)),
              quantity: 1,
            },
          ];

    const body: Record<string, unknown> = {
      shopCode: OTP_SHOP_CODE,
      creditType: OTP_CREDIT_TYPE,
      externalOrderId: input.orderId,
      goods,
    };

    const resp = await fetch(`${OTP_API_BASE}/configurations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data: any = await resp.json().catch(() => ({}));

    if (!resp.ok || data?.status) {
      const message =
        data?.detail ?? data?.message ?? `HTTP ${resp.status}`;
      throw new Error(`OTP configurations failed: ${message}`);
    }

    const configId = String(data.id ?? "");
    if (!configId) {
      throw new Error("OTP configurations returned empty id");
    }

    const confirmationUrl = `${OTP_SMART_FORM_BASE}?config=${encodeURIComponent(configId)}`;

    return {
      kind: "redirect",
      providerPaymentId: configId,
      confirmationUrl,
      status: "pending",
    };
  }

  /**
   * Резервный канал: дёргаем REST «Просмотр БП» по optyRequestId (его мы
   * получим из первого webhook'а и сохраним в Order.ykSnapshot).
   *
   * providerPaymentId здесь — это либо configurationId (до первого webhook'а),
   * либо optyRequestId (после). На configurationId ОТП может не отвечать —
   * тогда возвращаем pending, пусть webhook приходит сам.
   */
  async getPaymentStatus(providerPaymentId: string): Promise<PaymentStatusResult> {
    try {
      const token = await getAccessToken();
      const resp = await fetch(
        `${OTP_API_BASE}/bp-state/${encodeURIComponent(providerPaymentId)}`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (!resp.ok) {
        return {
          providerPaymentId,
          status: "pending",
          raw: { httpStatus: resp.status, note: "bp-state lookup failed" },
        };
      }
      const data: any = await resp.json();
      return {
        providerPaymentId: String(data?.optyRequestId ?? providerPaymentId),
        status: mapOtpStateToOurs(String(data?.state ?? "")),
        raw: data,
      };
    } catch (e) {
      // REST требует логин/пароль — если их нет, fallback к pending.
      return {
        providerPaymentId,
        status: "pending",
        raw: { error: e instanceof Error ? e.message : String(e) },
      };
    }
  }

  /**
   * Возврат через API ОТП пока не поддерживается на нашей стороне.
   * По кредитным/рассроченным договорам возвраты оформляются через банк.
   * При вызове бросаем понятную ошибку — UI «Вернуть деньги» в админке
   * для ОТП-заказов нужно скрыть (см. /admin/orders).
   */
  async refund(_input: RefundInput): Promise<RefundResult> {
    throw new Error(
      "Возврат через API ОТП не реализован. По кредитным/рассроченным " +
        "договорам возврат оформляется через банк — обратитесь к куратору."
    );
  }

  /**
   * Webhook от ОТП. Защита по IP делается на уровне route-handler'а;
   * сам провайдер только парсит тело и нормализует статус.
   *
   * Пример тела (из доки):
   *   {
   *     "stateId":  "c752f0a3-eb98-40d2-b122-10e3df199c10",
   *     "state":    "AGREEMENT_AUTHORIZED",
   *     "stateDescription": "Договор авторизован",
   *     "externalOrderId":  "10001",            ← наш Order.id
   *     "optyRequestId":    "7-IBONULNK",       ← номер заявки
   *     "rejectCode": null, "rejectReason": null,
   *     "modifiedAt":   "2023-11-28T15:00:46.788Z",
   *     "creditAmount": 20000, "firstPayment": 0,
   *     "goodsCreditAmount": 20000,
   *     "agreementNumber":  "4051636929",
   *     "productType": 1
   *   }
   */
  async parseWebhook(
    rawBody: string,
    _headers: Record<string, string>
  ): Promise<PaymentStatusResult | null> {
    let data: any;
    try {
      data = JSON.parse(rawBody);
    } catch {
      return null;
    }
    // Проверяем минимально необходимые поля. Если их нет — это не наш
    // вебхук (или мусор), возвращаем null.
    if (
      typeof data?.state !== "string" ||
      typeof data?.externalOrderId !== "string"
    ) {
      return null;
    }

    const optyRequestId = String(data.optyRequestId ?? "");
    const externalOrderId = String(data.externalOrderId);
    const status = mapOtpStateToOurs(data.state);

    return {
      providerPaymentId: optyRequestId || externalOrderId,
      merchantOrderId: externalOrderId,
      status,
      paidAt: status === "paid" ? new Date() : undefined,
      paymentMethod: productTypeToMethod(data.productType),
      raw: data,
    };
  }
}

// ─── helpers ───────────────────────────────────────────────────────────────

/**
 * Маппинг state ОТП в наш PaymentStatus.
 *
 * AGREEMENT_PAID — единственный «деньги у мерчанта, можно выдавать товар».
 * AGREEMENT_AUTHORIZED — договор авторизован, но деньги ещё не пришли.
 *
 * Терминальные «не успех» статусы идут в cancelled. Все промежуточные
 * (DECISION_x, ESIA_x, AGREEMENT_CREATED_x / SIGNED / AUTHORIZED, ...) —
 * pending: webhook handler такие логирует как progress, но статус заказа
 * не меняет.
 */
export function mapOtpStateToOurs(state: string): PaymentStatus {
  switch (state) {
    case "AGREEMENT_PAID":
      return "paid";

    case "REJECTED":
    case "AGREEMENT_SIGN_FAILED":
    case "CANCEL_AUTHORIZATION":
    case "EXECUTION_ERROR":
    case "NOT_PAYABLE":
    case "ARCHIVE":
    case "DELIVERY_DOCUMENTS_PROBLEM":
    case "DECISION_INFORMATION":
      return "cancelled";

    default:
      // OPTY_PREPARED, OPTY_CREATED, DECISION_APPROVAL, DECISION_PRE_APPROVAL,
      // ESIA_*, PPL20_ESIA_*, CONFIRMATION_AT_SHOP, DOCUMENT_SIGNING_OPTION,
      // SIGNING_AT_*, DELIVERY_DOCUMENTS, DOCUMENTS_DELIVERED,
      // AGREEMENT_CREATED_*, AGREEMENT_DOCS_SENT, AGREEMENT_SIGNED,
      // AGREEMENT_AUTHORIZED, PAYMENT_ORDER, ...
      return "pending";
  }
}

/** productType: 1 Кредит, 2 Кредит со скидкой, 3 Рассрочка. */
function productTypeToMethod(productType: unknown): string | undefined {
  switch (Number(productType)) {
    case 1:
      return "otp:credit";
    case 2:
      return "otp:credit_discount";
    case 3:
      return "otp:installment";
    default:
      return undefined;
  }
}

/**
 * Терминальные state ОТП — после них новых webhook'ов по этой заявке
 * быть не должно (используется в webhook handler для пометки «финал»).
 */
export const OTP_TERMINAL_STATES = new Set<string>([
  "AGREEMENT_PAID",
  "REJECTED",
  "AGREEMENT_SIGN_FAILED",
  "CANCEL_AUTHORIZATION",
  "EXECUTION_ERROR",
  "NOT_PAYABLE",
  "ARCHIVE",
]);
