/**
 * Политика повторов для EmailDeliveryJob.
 *
 * Каждая попытка увеличивает attemptCount и сдвигает nextAttemptAt.
 * После 5 неудачных попыток (attempt 1..5) джоб переходит в status=failed
 * и больше не берётся воркером.
 *
 * Цифры выбраны эмпирически для SMTP-ошибок:
 *   - 30s   — мгновенный временный сбой (DNS, кратковременная перегрузка)
 *   - 5m    — перегрузка на стороне получателя (Yandex/Mail.ru rate limit)
 *   - 30m   — провайдер требует cooldown
 *   - 2h    — серьёзный проблемный почтовик, ждём окно
 *
 * Permanent ошибки (хард-баунс, домен не существует, mailbox not found) должны
 * быть распознаны на уровне сендера — он переводит джоб в failed без retry.
 * См. process-campaigns.ts → classifyError().
 */

const BACKOFF_MS = [
  30 * 1000,
  5 * 60 * 1000,
  30 * 60 * 1000,
  2 * 60 * 60 * 1000,
] as const;

export const MAX_ATTEMPTS = BACKOFF_MS.length + 1; // 5

/**
 * Считает следующий nextAttemptAt по текущему attemptCount.
 * Если attemptCount уже превысил лимит — возвращает null (значит failed).
 */
export function computeNextAttempt(attemptCount: number, now: Date = new Date()): Date | null {
  if (attemptCount >= MAX_ATTEMPTS) return null;
  const idx = Math.min(attemptCount - 1, BACKOFF_MS.length - 1);
  const delay = BACKOFF_MS[Math.max(0, idx)];
  return new Date(now.getTime() + delay);
}

/**
 * Описывает классификацию ошибки от SMTP/HTTP провайдера.
 * Permanent — не делаем retry (адрес мёртв, домен не существует).
 * Transient — делаем retry по backoff.
 */
export type ErrorKind = "permanent" | "transient";

/**
 * Эвристика по сообщению ошибки. На MVP — простая.
 * Реальные SMTP-коды распознаём по 5xx (permanent) vs 4xx (transient).
 */
export function classifyError(error: unknown): ErrorKind {
  const message = String(error instanceof Error ? error.message : error).toLowerCase();

  // 5xx SMTP-коды — permanent.
  if (/\b5\d{2}\b/.test(message)) return "permanent";
  if (/mailbox.*(not|doesn).*exist|no such user|user unknown|invalid recipient|user not found/.test(message)) {
    return "permanent";
  }
  if (/domain.*(not|doesn).*exist|host (not found|unknown)|nxdomain/.test(message)) {
    return "permanent";
  }
  if (/relay (denied|access denied)|550/i.test(message)) return "permanent";

  // Всё остальное считаем transient — повторим.
  return "transient";
}
