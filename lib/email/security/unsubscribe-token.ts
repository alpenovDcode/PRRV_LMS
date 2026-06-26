import { randomBytes } from "crypto";

/**
 * Одноразово-генерируемый (но переиспользуемый) токен для one-click unsubscribe.
 *
 * Хранится в User.unsubscribeToken @unique. Включается в каждое маркетинговое
 * письмо в виде ссылки https://prrv.tech/email/unsubscribe/<token>.
 *
 * Ротация: при повторной подписке (если такое будет в админке) генерируем
 * новый токен — старая ссылка перестаёт работать. До этого момента ссылка
 * валидна неограниченно.
 *
 * Энтропии 32 байта (256 бит) более чем достаточно: даже при базе 10⁹
 * подписчиков вероятность столкновения < 2⁻¹⁹⁰.
 */
export function generateUnsubscribeToken(): string {
  return randomBytes(32).toString("base64url");
}
