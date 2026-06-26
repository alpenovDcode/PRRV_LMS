import { timingSafeEqual } from "crypto";

/**
 * Constant-time comparison двух токенов/секретов.
 *
 * Используется для проверки `Authorization: Bearer <secret>` из cron-sidecar,
 * для HMAC-подписи webhook'ов от Unisender и любых других ситуаций, где
 * простое `===` ведёт к timing-атаке.
 *
 * Возвращает false при пустом первом аргументе, чтобы вызывающий код мог
 * писать `if (!compareConstantTime(provided, expected)) return 401`.
 *
 * Те же гарантии, что и timingSafeEqual из node:crypto, но без падения,
 * если длины не совпадают — просто false.
 */
export function compareConstantTime(provided: string | undefined | null, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
