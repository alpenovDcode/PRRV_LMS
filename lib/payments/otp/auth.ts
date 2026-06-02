/**
 * lib/payments/otp/auth.ts
 *
 * Авторизация в платформе ОТП по OpenID Connect (Keycloak).
 *
 * Используется только серверными вызовами REST API (просмотр БП, аудит).
 * Эндпоинт /smart-form-link/v1/configurations авторизации НЕ требует —
 * аутентификация там по shopCode в теле запроса.
 *
 * Стратегия:
 *   • Первый запрос — grant_type=password (логин/пароль из env).
 *   • Кэшируем access_token + refresh_token в памяти процесса.
 *   • Обновляем по refresh_token за 30 сек до истечения, чтобы
 *     параллельные запросы не наткнулись на 401.
 *   • Если refresh упал — делаем повторный логин по паролю.
 *
 * Кэш в памяти достаточен: токены живут минутами, рестарт пода = новый логин.
 */

import {
  OTP_KEYCLOAK_URL,
  OTP_LOGIN,
  OTP_PASSWORD,
  assertOtpRestConfig,
} from "./config";

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  refresh_expires_in: number;
  token_type: string;
}

interface TokenCache {
  accessToken: string;
  refreshToken: string;
  /** Unix ms когда access_token истекает. */
  expiresAt: number;
  /** Unix ms когда refresh_token истекает. */
  refreshExpiresAt: number;
}

let cache: TokenCache | null = null;
let inflight: Promise<string> | null = null;

const SAFETY_MS = 30_000; // обновлять за 30 сек до истечения

async function fetchToken(params: Record<string, string>): Promise<TokenResponse> {
  const body = new URLSearchParams(params);
  const resp = await fetch(OTP_KEYCLOAK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(
      `OTP Keycloak ${params.grant_type} failed: ${resp.status} ${text.slice(0, 200)}`
    );
  }
  return (await resp.json()) as TokenResponse;
}

function applyToken(t: TokenResponse): void {
  const now = Date.now();
  cache = {
    accessToken: t.access_token,
    refreshToken: t.refresh_token,
    expiresAt: now + t.expires_in * 1000,
    refreshExpiresAt: now + t.refresh_expires_in * 1000,
  };
}

async function loginWithPassword(): Promise<string> {
  assertOtpRestConfig();
  const t = await fetchToken({
    grant_type: "password",
    client_id: "poc",
    username: OTP_LOGIN,
    password: OTP_PASSWORD,
  });
  applyToken(t);
  return t.access_token;
}

async function refreshWithToken(refreshToken: string): Promise<string> {
  const t = await fetchToken({
    grant_type: "refresh_token",
    client_id: "poc",
    refresh_token: refreshToken,
  });
  applyToken(t);
  return t.access_token;
}

/**
 * Получить актуальный access_token. Если в кэше живой — отдаст его,
 * иначе обновит через refresh_token или сделает повторный логин.
 *
 * Параллельные вызовы дедуплицируются через inflight promise.
 */
export async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cache && cache.expiresAt - SAFETY_MS > now) {
    return cache.accessToken;
  }
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      // refresh_token ещё живой — пробуем им
      if (cache && cache.refreshExpiresAt - SAFETY_MS > now) {
        try {
          return await refreshWithToken(cache.refreshToken);
        } catch (e) {
          console.warn("[otp/auth] refresh failed, fallback to password login:", e);
          cache = null;
        }
      }
      return await loginWithPassword();
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/** Сбросить кэш токена (для тестов и форс-релогина из админки). */
export function clearTokenCache(): void {
  cache = null;
  inflight = null;
}
