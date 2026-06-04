/**
 * lib/payments/freshcredit/provider.ts
 *
 * FreshcreditProvider — реализация PaymentProvider для виджета Freshcredit
 * (BNPL/кредит/рассрочка партнёров). Redirect-схема, как у ОТП.
 *
 * Цепочка:
 *   1. createPayment → POST /widget-api/createOrder с Bearer + orderId,
 *      pointId, items[]. Получаем uuid заявки.
 *   2. Возвращаем confirmationUrl = <widget>/<uuid>. На странице оплаты
 *      кнопка открывает виджет в новой вкладке, клиент проходит KYC.
 *   3. Webhook прилетает на КАЖДУЮ смену статуса (pending → approved →
 *      cooling → issued → ...). Активация заказа — на status=issued.
 *      Терминальные «не успех» (cancel, rejected) → cancelled. refund →
 *      refunded.
 *   4. refund() — POST /widget-api/refund с {uuid, sum}. У ОТП этого
 *      нет, у Freshcredit есть → возвраты идут через нашу админку.
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
  FC_API_BASE,
  FC_WIDGET_BASE,
  FC_POINT_ID,
  FC_GOODS_CODE,
  FC_CREDIT_TYPE,
  FC_CREDIT_TERMS,
  FC_INSTALLMENTS_TERMS,
  assertFcConfig,
} from "./config";
import { getAccessToken } from "./auth";

export class FreshcreditProvider implements PaymentProvider {
  readonly name = "freshcredit";

  async createPayment(input: CreatePaymentInput): Promise<CreatedPayment> {
    assertFcConfig();
    const token = await getAccessToken();

    // Items: каждый receiptItem → одна позиция, иначе одна на всю сумму.
    const items =
      input.receiptItems && input.receiptItems.length > 0
        ? input.receiptItems.map((it) => ({
            name: it.label.slice(0, 256),
            price: Number(it.price.toFixed(2)),
            goodsCode: FC_GOODS_CODE,
            quantity: it.quantity,
          }))
        : [
            {
              name: input.description.slice(0, 256),
              price: Number(input.amount.toFixed(2)),
              goodsCode: FC_GOODS_CODE,
              quantity: 1,
            },
          ];

    const body: Record<string, unknown> = {
      orderId: input.orderId, // вернётся в webhook как orderId
      pointId: FC_POINT_ID,
      items,
      // creditType / creditTerm / installmentsTerm — конфигурятся в env.
      // Передаём в виде JSON-массива/числа, как ждёт API.
      ...(FC_CREDIT_TYPE ? { creditType: tryParseJson(FC_CREDIT_TYPE) } : {}),
      ...(FC_CREDIT_TERMS ? { creditTerm: tryParseJson(FC_CREDIT_TERMS) } : {}),
      ...(FC_INSTALLMENTS_TERMS
        ? { installmentsTerm: tryParseJson(FC_INSTALLMENTS_TERMS) }
        : {}),
      // callbackUrl — куда вернуться после виджета. Берём наш success-page.
      callbackUrl: input.returnUrl,
    };

    const resp = await fetch(`${FC_API_BASE}/createOrder`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    const data: any = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      throw new Error(
        `Freshcredit createOrder failed: ${resp.status} ${
          data?.message ?? JSON.stringify(data).slice(0, 200)
        }`
      );
    }

    // CreateOrderResponse возвращает uuid (по спеке возвращается uuid заказа).
    const uuid: string =
      typeof data === "string" ? data : data?.uuid ?? data?.id ?? "";
    if (!uuid) {
      throw new Error("Freshcredit createOrder вернул пустой uuid");
    }

    const widgetBase = FC_WIDGET_BASE.endsWith("/")
      ? FC_WIDGET_BASE.slice(0, -1)
      : FC_WIDGET_BASE;
    const confirmationUrl = `${widgetBase}/${encodeURIComponent(uuid)}`;

    return {
      kind: "redirect",
      providerPaymentId: uuid,
      confirmationUrl,
      status: "pending",
    };
  }

  /**
   * Резервная проверка статуса (для админской кнопки «обновить статус»).
   * GET /widget-api/checkStatus/<uuid> с Bearer.
   */
  async getPaymentStatus(providerPaymentId: string): Promise<PaymentStatusResult> {
    try {
      const token = await getAccessToken();
      const resp = await fetch(
        `${FC_API_BASE}/checkStatus/${encodeURIComponent(providerPaymentId)}`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const data: any = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        return {
          providerPaymentId,
          status: "pending",
          raw: { httpStatus: resp.status, note: "checkStatus failed" },
        };
      }
      return {
        providerPaymentId,
        status: mapFcStatusToOurs(String(data?.status ?? "")),
        raw: data,
      };
    } catch (e) {
      return {
        providerPaymentId,
        status: "pending",
        raw: { error: e instanceof Error ? e.message : String(e) },
      };
    }
  }

  /**
   * Возврат через API Freshcredit. Передаём uuid (наш Order.ykPaymentId) +
   * сумму. Если сумму не передали — возвращаем всю.
   */
  async refund(input: RefundInput): Promise<RefundResult> {
    assertFcConfig();
    const token = await getAccessToken();

    const body: Record<string, unknown> = {
      uuid: input.providerPaymentId,
    };
    if (input.amount != null) body.sum = input.amount;

    const resp = await fetch(`${FC_API_BASE}/refund`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    const data: any = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const msg = data?.message ?? `HTTP ${resp.status}`;
      throw new Error(`Freshcredit refund failed: ${msg}`);
    }

    return {
      // У Freshcredit нет отдельного refundId — используем uuid.
      refundId: String(input.providerPaymentId),
      amount: Number(data?.sum ?? input.amount ?? 0),
      // refund в Freshcredit идёт асинхронно (webhook со status=refund
      // прилетит позже после фактического возврата).
      status: "pending",
      raw: data,
    };
  }

  /**
   * Webhook от Freshcredit. Защита по IP делается в route-handler'е;
   * сам провайдер только парсит тело и нормализует статус.
   *
   * Структура (CheckStatusOrderResponse):
   *   {
   *     "uuid": "<uuid заявки>",
   *     "orderId": "<наш Order.id>",
   *     "status": "issued",   // pending | approved | cooling | issued |
   *                           //   cancel | rejected | refund
   *     "paymentSum": 74990,
   *     "offers": [...], "items": [...], "client": {...},
   *     "contractNumber": "...", "signingType": "...",
   *     "coolingPeriodEndStamp": "...", "refundSum": ...
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
    if (typeof data?.status !== "string" || typeof data?.orderId !== "string") {
      return null;
    }

    const uuid = String(data.uuid ?? "");
    const orderId = String(data.orderId);
    const status = mapFcStatusToOurs(data.status);

    return {
      providerPaymentId: uuid || orderId,
      merchantOrderId: orderId,
      status,
      paidAt: status === "paid" ? new Date() : undefined,
      paymentMethod: deriveMethod(data),
      raw: data,
    };
  }
}

// ─── helpers ───────────────────────────────────────────────────────────────

/**
 * Маппинг status Freshcredit → наш PaymentStatus.
 *
 * issued — «Выдан» (деньги у мерчанта) → активируем заказ.
 * refund — webhook о возврате → refunded.
 * cancel / rejected — терминальные «не успех» → cancelled.
 * pending / approved / cooling — промежуточные → pending (логируем прогресс).
 */
export function mapFcStatusToOurs(status: string): PaymentStatus {
  switch (status) {
    case "issued":
      return "paid";
    case "refund":
      return "refunded";
    case "cancel":
    case "rejected":
      return "cancelled";
    case "approved":
    case "cooling":
    case "pending":
    default:
      return "pending";
  }
}

/** Тип продукта для отображения метода оплаты. */
function deriveMethod(data: any): string | undefined {
  // CreateOrderResponse / CheckStatus возвращает creditType (если выбран).
  const t = data?.creditType ?? data?.selectedOffer?.creditType;
  if (t === 1 || t === "1") return "freshcredit:credit";
  if (t === 2 || t === "2") return "freshcredit:installment";
  return "freshcredit";
}

/** Безопасный JSON.parse — если не парсится, возвращает строку как есть. */
function tryParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/** Терминальные статусы Freshcredit — после них новых webhook'ов не ждём. */
export const FC_TERMINAL_STATUSES = new Set<string>([
  "issued",
  "cancel",
  "rejected",
  "refund",
]);
