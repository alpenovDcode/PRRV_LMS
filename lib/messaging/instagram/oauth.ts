/**
 * lib/messaging/instagram/oauth.ts
 *
 * Helpers для OAuth 2.0 flow подключения Instagram Business-аккаунта.
 *
 * Шаги (см. docs/INSTAGRAM_OAUTH.md когда будет):
 *   1. buildAuthorizeUrl() — формируем URL, на который редиректим пользователя
 *   2. После логина юзер возвращается на /api/messaging/instagram/oauth/callback?code=...
 *   3. exchangeCodeForShortToken() — обмен code на short-lived token (1ч)
 *   4. exchangeShortForLongToken() — обмен на long-lived (60 дней)
 *   5. fetchMe() — получаем username/id аккаунта
 *   6. refreshLongLivedToken() — продление токена раз в N дней (cron)
 */

import {
  IG_APP_ID,
  IG_APP_SECRET,
  IG_OAUTH_AUTHORIZE_URL,
  IG_OAUTH_REDIRECT_URI,
  IG_OAUTH_TOKEN_URL,
  IG_GRAPH_BASE,
  IG_SCOPES,
} from "./config";

// ─── 1. Build authorize URL ─────────────────────────────────────────────────

export function buildAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: IG_APP_ID,
    redirect_uri: IG_OAUTH_REDIRECT_URI,
    response_type: "code",
    scope: IG_SCOPES.join(","),
    state,
  });
  return `${IG_OAUTH_AUTHORIZE_URL}?${params.toString()}`;
}

// ─── 2. Exchange code → short-lived token ───────────────────────────────────

export interface ShortLivedToken {
  access_token: string;
  user_id: string | number;
  permissions?: string[];
}

export async function exchangeCodeForShortToken(code: string): Promise<ShortLivedToken> {
  const body = new URLSearchParams({
    client_id: IG_APP_ID,
    client_secret: IG_APP_SECRET,
    grant_type: "authorization_code",
    redirect_uri: IG_OAUTH_REDIRECT_URI,
    code,
  });

  const resp = await fetch(IG_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`IG OAuth token exchange failed: ${resp.status} ${err.slice(0, 200)}`);
  }

  return resp.json();
}

// ─── 3. Exchange short → long-lived (60 days) ───────────────────────────────

export interface LongLivedToken {
  access_token: string;
  token_type: string;
  expires_in: number; // seconds, обычно ~5184000 (60 дней)
}

export async function exchangeShortForLongToken(shortToken: string): Promise<LongLivedToken> {
  const url =
    `${IG_GRAPH_BASE}/access_token?` +
    new URLSearchParams({
      grant_type: "ig_exchange_token",
      client_secret: IG_APP_SECRET,
      access_token: shortToken,
    }).toString();

  const resp = await fetch(url);
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`IG long-lived exchange failed: ${resp.status} ${err.slice(0, 200)}`);
  }
  return resp.json();
}

// ─── 4. Refresh long-lived (продление до истечения) ─────────────────────────

export async function refreshLongLivedToken(currentToken: string): Promise<LongLivedToken> {
  const url =
    `${IG_GRAPH_BASE}/refresh_access_token?` +
    new URLSearchParams({
      grant_type: "ig_refresh_token",
      access_token: currentToken,
    }).toString();

  const resp = await fetch(url);
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`IG token refresh failed: ${resp.status} ${err.slice(0, 200)}`);
  }
  return resp.json();
}

// ─── 5. Fetch /me ──────────────────────────────────────────────────────────

export interface InstagramAccountInfo {
  id: string;
  /** Реальный Business Account ID (не app-scoped). Совпадает с entry.id в webhook. */
  user_id?: string;
  username: string;
  account_type?: string; // "BUSINESS" | "MEDIA_CREATOR" | "PERSONAL"
}

export async function fetchMe(longLivedToken: string): Promise<InstagramAccountInfo> {
  // Используем версионированный endpoint graph.instagram.com/v21.0/me
  const url =
    `${IG_GRAPH_BASE}/v21.0/me?` +
    new URLSearchParams({
      fields: "id,user_id,username,account_type",
      access_token: longLivedToken,
    }).toString();

  const resp = await fetch(url);
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`IG /me fetch failed: ${resp.status} ${err.slice(0, 200)}`);
  }
  const data = await resp.json();
  // Диагностика: логируем оба поля, чтобы понять что именно совпадает с entry.id в webhook
  console.log(`[ig-oauth] fetchMe result: id="${data.id}", user_id="${data.user_id}", username="${data.username}", account_type="${data.account_type}"`);
  return data;
}

// ─── 6. Subscribe app to messaging webhook ─────────────────────────────────

export async function subscribeToMessagingWebhook(
  igAccountId: string,
  longLivedToken: string
): Promise<void> {
  // ВАЖНО: Meta ожидает application/x-www-form-urlencoded, а НЕ JSON.
  // subscribed_fields должны быть переданы как form-поле, а не JSON-строка
  // (иначе Graph API отвечает "Cannot parse access token", code 190).
  //
  // subscribed_fields:
  //   messages, messaging_postbacks — входящие DM и нажатия кнопок;
  //   comments                      — комментарии под постами (для keyword_comment).
  const url = `${IG_GRAPH_BASE}/v21.0/${igAccountId}/subscribed_apps`;
  const body = new URLSearchParams({
    subscribed_fields: "messages,messaging_postbacks,comments",
    access_token: longLivedToken,
  });
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const respText = await resp.text();
  if (!resp.ok) {
    throw new Error(`IG webhook subscribe failed: ${resp.status} ${respText.slice(0, 200)}`);
  }
  // Проверяем success: true явно — Meta может вернуть 200 OK с {success: false}
  let parsed: unknown;
  try {
    parsed = JSON.parse(respText);
  } catch {
    parsed = null;
  }
  if (parsed && typeof parsed === "object" && (parsed as Record<string, unknown>).success === false) {
    throw new Error(`IG webhook subscribe returned success=false: ${respText.slice(0, 300)}`);
  }
  console.warn("[ig-oauth] subscribeToMessagingWebhook OK:", respText.slice(0, 200));
}

/**
 * Прочитать, какие webhook-поля реально подписаны на этом IG-аккаунте.
 * GET /{ig-id}/subscribed_apps → { data: [{ subscribed_fields: [...] }] }.
 *
 * Диагностика: если в результате НЕТ "messages" — Instagram будет слать только
 * служебные события (message_edit и т.п.), а входящие DM не дойдут. Тогда
 * проблема на уровне приложения в Meta App Dashboard (Webhooks → Instagram).
 */
export async function getSubscribedFields(
  igAccountId: string,
  longLivedToken: string
): Promise<string[]> {
  const url =
    `${IG_GRAPH_BASE}/v21.0/${igAccountId}/subscribed_apps?` +
    new URLSearchParams({ access_token: longLivedToken }).toString();
  const resp = await fetch(url);
  const data: any = await resp.json().catch(() => ({}));
  const apps = Array.isArray(data?.data) ? data.data : [];
  const fields = new Set<string>();
  for (const app of apps) {
    for (const f of app?.subscribed_fields ?? []) {
      // subscribed_fields может быть массивом строк или объектов { name }.
      if (typeof f === "string") fields.add(f);
      else if (f?.name) fields.add(String(f.name));
    }
  }
  return Array.from(fields);
}

/**
 * Отписаться от webhook'а — нужно при удалении бота, чтобы Meta перестала
 * слать события на нашу LMS.
 *
 * Best-effort: возвращает true/false, не бросает. Если отписка не удалась
 * (например токен уже истёк), мы всё равно удалим бота из БД.
 */
export async function unsubscribeFromMessagingWebhook(
  igAccountId: string,
  longLivedToken: string
): Promise<boolean> {
  try {
    const url =
      `${IG_GRAPH_BASE}/v21.0/${igAccountId}/subscribed_apps?` +
      new URLSearchParams({ access_token: longLivedToken }).toString();
    const resp = await fetch(url, { method: "DELETE" });
    return resp.ok;
  } catch {
    return false;
  }
}
