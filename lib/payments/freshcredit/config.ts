/**
 * lib/payments/freshcredit/config.ts
 *
 * Конфигурация Freshcredit (BNPL/кредит/рассрочка) — клиентский виджет
 * партнёра. Полная редиректная схема, как у ОТП.
 *
 * Получи у курирующего менеджера Freshcredit:
 *   FC_LOGIN       — логин технической учётной записи
 *   FC_PASSWORD    — пароль
 *   FC_POINT_ID    — UUID торговой точки партнёра
 *   FC_WEBHOOK_IPS — IP адреса Freshcredit для whitelist webhook
 *
 * Опционально (есть дефолты):
 *   FC_GOODS_CODE  — код товара из справочника. 9 = «Курсы и тренинги»
 *                    (рекомендовано для LMS); 1 = «Ин. языки»; 2 = «Другое
 *                    обучение»; полный список в доке.
 *   FC_CREDIT_TYPE — "1" Кредит, "2" Рассрочка, "[1,2]" Оба. Дефолт [1,2].
 *   FC_API_BASE / FC_WIDGET_BASE — переопределение тест/прод URL.
 *
 * Тестовая среда:
 *   API:    https://formapitest.freshcredit.ru:5047/widget-api
 *   Widget: https://widget-test.freshcredit.ru/order/
 *
 * Промышленная среда:
 *   API:    https://formapi.freshcredit.ru:5046/widget-api
 *   Widget: https://widget.freshcredit.ru/order/
 */

export const FC_LOGIN = process.env.FC_LOGIN || "";
export const FC_PASSWORD = process.env.FC_PASSWORD || "";
export const FC_POINT_ID = process.env.FC_POINT_ID || "";

/**
 * Сервер Freshcredit на :5046 отдаёт неполную цепочку TLS-сертификатов
 * (нет промежуточного CA), из-за чего Node-fetch ругается
 * UNABLE_TO_VERIFY_LEAF_SIGNATURE. Этот флаг точечно отключает TLS-
 * валидацию ТОЛЬКО для запросов к Freshcredit. Все остальные fetch'и
 * в приложении (CloudPayments, ОТП, Bitrix, прочее) работают со
 * стандартной проверкой.
 *
 * Дефолт true, потому что без него интеграция не работает. Когда
 * Freshcredit починят SSL — поставить "false" (или убрать env).
 */
export const FC_INSECURE_TLS =
  (process.env.FC_INSECURE_TLS ?? "true").toLowerCase() !== "false";

/** Код товара из справочника. 9 = «Курсы и тренинги» — самое подходящее для LMS. */
export const FC_GOODS_CODE = parseInt(process.env.FC_GOODS_CODE || "9", 10);

/**
 * Тип кредитного продукта.
 *   "1"     — только кредит;
 *   "2"     — только рассрочка;
 *   "[1,2]" — оба (рекомендовано — клиент выберет).
 */
export const FC_CREDIT_TYPE = process.env.FC_CREDIT_TYPE || "[1,2]";

/** Сроки кредита/рассрочки. Пустые = без ограничений. */
export const FC_CREDIT_TERMS = process.env.FC_CREDIT_TERMS || ""; // напр. "[12,24,36]"
export const FC_INSTALLMENTS_TERMS = process.env.FC_INSTALLMENTS_TERMS || ""; // напр. "[6,10,12]"

export const FC_API_BASE =
  process.env.FC_API_BASE ||
  "https://formapi.freshcredit.ru:5046/widget-api";

export const FC_WIDGET_BASE =
  process.env.FC_WIDGET_BASE ||
  "https://widget.freshcredit.ru/order";

/**
 * Whitelist IP-адресов Freshcredit для webhook. Пустой = пропускаем всех
 * (опасно, только для dev). На проде задавать обязательно.
 */
export function getWebhookIpWhitelist(): string[] {
  const raw = process.env.FC_WEBHOOK_IPS || "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Минимальный набор env для инициации платежа:
 *   • POINT_ID — без него createOrder не имеет смысла;
 *   • LOGIN/PASSWORD — нужны для авторизации API (в отличие от ОТП, где
 *     /configurations публичный, у Freshcredit любой запрос требует Bearer).
 */
export function assertFcConfig(): void {
  const missing: string[] = [];
  if (!FC_POINT_ID) missing.push("FC_POINT_ID");
  if (!FC_LOGIN) missing.push("FC_LOGIN");
  if (!FC_PASSWORD) missing.push("FC_PASSWORD");
  if (missing.length > 0) {
    throw new Error(`Freshcredit not configured: missing ${missing.join(", ")}`);
  }
}
