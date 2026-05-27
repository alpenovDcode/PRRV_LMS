/**
 * lib/messaging/max/config.ts
 *
 * Конфигурация MAX Bot API.
 *
 * Авторизация — bot token, который пользователь получает у @MasterBot в MAX.
 * Токен хранится зашифрованным в MessagingBot.tokenEnc (как у Telegram).
 */

export const MAX_API_BASE = "https://platform-api.max.ru";

/**
 * URL вебхука, на который MAX будет слать события.
 * Регистрируется через POST /subscriptions при подключении бота.
 */
export function getMaxWebhookUrl(): string {
  const appUrl = process.env.PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://prrv.tech";
  return `${appUrl}/api/messaging/webhook/max`;
}
