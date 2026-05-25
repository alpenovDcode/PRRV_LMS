/**
 * lib/messaging/instagram/config.ts
 *
 * Конфигурация Instagram Login API (через Meta).
 *
 * Env-переменные, обязательные для подключения:
 *   IG_APP_ID                — Public App ID из Meta for Developers
 *   IG_APP_SECRET            — Secret (НЕ выносить во фронт!)
 *   IG_OAUTH_REDIRECT_URI    — URL нашего callback'а (должен быть прописан в Meta App)
 *   IG_WEBHOOK_VERIFY_TOKEN  — рандомный секрет для verify-handshake вебхука
 *                              (мы сами придумываем, потом вводим в Meta App)
 */

export const IG_APP_ID = process.env.IG_APP_ID || "";
export const IG_APP_SECRET = process.env.IG_APP_SECRET || "";
export const IG_OAUTH_REDIRECT_URI =
  process.env.IG_OAUTH_REDIRECT_URI ||
  `${process.env.PUBLIC_APP_URL ?? "https://prrv.tech"}/api/messaging/instagram/oauth/callback`;
export const IG_WEBHOOK_VERIFY_TOKEN = process.env.IG_WEBHOOK_VERIFY_TOKEN || "";

/** Какие permissions запрашиваем у Meta. */
export const IG_SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_messages",
] as const;

/** Graph API endpoints. */
export const IG_OAUTH_AUTHORIZE_URL = "https://www.instagram.com/oauth/authorize";
export const IG_OAUTH_TOKEN_URL = "https://api.instagram.com/oauth/access_token";
export const IG_GRAPH_BASE = "https://graph.instagram.com";

/** Проверяет что все обязательные env заданы. */
export function assertIgConfig(): void {
  const missing: string[] = [];
  if (!IG_APP_ID) missing.push("IG_APP_ID");
  if (!IG_APP_SECRET) missing.push("IG_APP_SECRET");
  if (!IG_WEBHOOK_VERIFY_TOKEN) missing.push("IG_WEBHOOK_VERIFY_TOKEN");
  if (missing.length > 0) {
    throw new Error(`Instagram integration not configured: missing ${missing.join(", ")}`);
  }
}
