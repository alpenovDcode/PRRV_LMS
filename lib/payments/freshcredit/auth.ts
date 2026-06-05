/**
 * lib/payments/freshcredit/auth.ts
 *
 * Авторизация в API Freshcredit.
 *
 * POST /widget-api/login → { token, expires }  (срок жизни 14ч)
 *
 * Стратегия:
 *   • Первый запрос — логин по паре login/password из env.
 *   • Токен и его дата истечения кэшируются в памяти процесса.
 *   • Обновляем за 60 сек до истечения (или при 401), чтобы параллельные
 *     запросы не натыкались на просроченный токен.
 *   • Параллельные обновления дедуплицируются через inflight promise.
 *
 * Refresh-token у Freshcredit нет — при истечении делаем повторный login.
 */

import { FC_API_BASE, FC_LOGIN, FC_PASSWORD, assertFcConfig } from "./config";

interface LoginResponse {
  token: string;
  /** ISO дата истечения в UTC. */
  expires: string;
}

interface TokenCache {
  token: string;
  /** Unix ms когда токен истекает (на основе expires). */
  expiresAt: number;
}

let cache: TokenCache | null = null;
let inflight: Promise<string> | null = null;

/** Обновлять за 60 секунд до истечения, чтобы параллельные запросы не наткнулись на 401. */
const SAFETY_MS = 60_000;

async function loginAndCache(): Promise<string> {
  assertFcConfig();
  const resp = await fetch(`${FC_API_BASE}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: FC_LOGIN, password: FC_PASSWORD }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(
      `Freshcredit login failed: ${resp.status} ${text.slice(0, 200)}`
    );
  }
  const data: LoginResponse = await resp.json();
  if (!data.token) {
    throw new Error("Freshcredit login: пустой токен в ответе");
  }
  const expiresAtMs =
    Date.parse(data.expires) || Date.now() + 14 * 60 * 60 * 1000;
  cache = { token: data.token, expiresAt: expiresAtMs };
  return data.token;
}

/**
 * Вернуть актуальный Bearer-токен. Если в кэше живой — отдаёт его, иначе
 * делает новый login. Параллельные вызовы дедуплицируются.
 */
export async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cache && cache.expiresAt - SAFETY_MS > now) {
    return cache.token;
  }
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      return await loginAndCache();
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Сбросить кэш — для force-релогина и тестов. */
export function clearTokenCache(): void {
  cache = null;
  inflight = null;
}
