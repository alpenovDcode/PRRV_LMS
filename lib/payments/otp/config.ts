/**
 * lib/payments/otp/config.ts
 *
 * Конфигурация ОТП Банка (smart-form для кредитов и рассрочки).
 *
 * Получи у куратора ОТП:
 *   OTP_SHOP_CODE   — Shop Code партнёра (например POS-00142-26-000002)
 *   OTP_LOGIN       — Логин технической учётной записи (для REST API)
 *   OTP_PASSWORD    — Пароль технической учётной записи
 *   OTP_WEBHOOK_IPS — IP-адреса ОТП, с которых будет приходить webhook
 *                     (через запятую, например "194.50.120.251")
 *
 * Опционально (есть дефолты):
 *   OTP_CATEGORY     — код категории товара (138 = образовательные услуги)
 *   OTP_CREDIT_TYPE  — "1" кредит / "2" кредит и рассрочка / "3" рассрочка
 *   OTP_KEYCLOAK_URL — endpoint авторизации (OpenID Connect)
 *   OTP_API_BASE     — база REST API (configurations, smart-form, bp-state)
 *   OTP_SMART_FORM_BASE — база URL smart-form (куда редиректим клиента)
 */

export const OTP_SHOP_CODE = process.env.OTP_SHOP_CODE || "";
export const OTP_LOGIN = process.env.OTP_LOGIN || "";
export const OTP_PASSWORD = process.env.OTP_PASSWORD || "";

/** Категория товара по справочнику ОТП. 138 = «Образовательные услуги». */
export const OTP_CATEGORY = process.env.OTP_CATEGORY || "RGB_GOODS_CATEGORY_138";

/**
 * Тип кредитного продукта.
 *   "1" — Кредит
 *   "2" — Кредит и рассрочка (рекомендуется — даём клиенту выбор)
 *   "3" — Рассрочка
 */
export const OTP_CREDIT_TYPE = process.env.OTP_CREDIT_TYPE || "2";

export const OTP_KEYCLOAK_URL =
  process.env.OTP_KEYCLOAK_URL ||
  "https://poslogin.otpbank.ru/keycloak/auth/realms/PPU/protocol/openid-connect/token";

export const OTP_API_BASE =
  process.env.OTP_API_BASE || "https://ecom.otpbank.ru/smart-form-link/v1";

export const OTP_SMART_FORM_BASE =
  process.env.OTP_SMART_FORM_BASE || "https://ecom.otpbank.ru/smart-form";

/**
 * Whitelist IP-адресов ОТП. Пустой список = пропускаем всех (опасно, только
 * для локальной отладки). На проде задавать обязательно.
 */
export function getWebhookIpWhitelist(): string[] {
  const raw = process.env.OTP_WEBHOOK_IPS || "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Проверка минимально необходимого набора env для инициации платежа.
 * Логин/пароль для createPayment НЕ нужны — endpoint /configurations публичный,
 * аутентификация по shopCode. Логин нужен только для REST «Просмотр БП».
 */
export function assertOtpConfig(): void {
  const missing: string[] = [];
  if (!OTP_SHOP_CODE) missing.push("OTP_SHOP_CODE");
  if (missing.length > 0) {
    throw new Error(`OTP not configured: missing ${missing.join(", ")}`);
  }
}

/**
 * Проверка для REST API (Bp-State, refund и пр.) — нужны логин/пароль.
 * Вызывается отдельно, чтобы createPayment работал без них.
 */
export function assertOtpRestConfig(): void {
  const missing: string[] = [];
  if (!OTP_LOGIN) missing.push("OTP_LOGIN");
  if (!OTP_PASSWORD) missing.push("OTP_PASSWORD");
  if (missing.length > 0) {
    throw new Error(`OTP REST not configured: missing ${missing.join(", ")}`);
  }
}
