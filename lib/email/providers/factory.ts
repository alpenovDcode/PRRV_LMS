import type { EmailProvider, EmailProviderName } from "./types";
import { YandexSmtpProvider } from "./yandex-smtp";
import { UnisenderProvider } from "./unisender";

/**
 * Фабрика провайдеров маркетинговой доставки. Резолвится по env
 * `EMAIL_MARKETING_PROVIDER`. По умолчанию — yandex (наш SMTP), чтобы
 * UI работал и в dev, и пока Unisender не подключён.
 *
 * Используется во всех слоях кроме транзакционки:
 *   - очередь /api/email-cron/tick
 *   - синк контактов
 *   - webhook /api/email/webhook/<provider>
 *   - админ-кнопка «отправить тестовое письмо»
 */

let cachedProvider: EmailProvider | null = null;
let cachedProviderName: EmailProviderName | null = null;

function instantiate(name: EmailProviderName): EmailProvider {
  switch (name) {
    case "yandex":
      return new YandexSmtpProvider();
    case "unisender":
      return new UnisenderProvider();
    default: {
      const exhaustive: never = name;
      throw new Error(`Unknown EMAIL_MARKETING_PROVIDER: ${exhaustive as string}`);
    }
  }
}

function resolveName(): EmailProviderName {
  const raw = (process.env.EMAIL_MARKETING_PROVIDER || "yandex").toLowerCase();
  if (raw === "yandex" || raw === "unisender") return raw;
  throw new Error(
    `EMAIL_MARKETING_PROVIDER должно быть "yandex" или "unisender", получено: ${raw}`
  );
}

/**
 * Текущий провайдер. Кэшируется в памяти процесса. При смене env
 * требуется перезапуск (это нормально — env-переменные читаются на старте).
 */
export function getMarketingEmailProvider(): EmailProvider {
  const name = resolveName();
  if (cachedProvider && cachedProviderName === name) return cachedProvider;

  cachedProvider = instantiate(name);
  cachedProviderName = name;
  return cachedProvider;
}

/**
 * Явный сброс кеша. Нужен только в тестах при подмене env.
 */
export function __resetProviderCache(): void {
  cachedProvider = null;
  cachedProviderName = null;
}
