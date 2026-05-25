/**
 * lib/messaging/encryption.ts
 *
 * Шифрование токенов мессенджеров. Использует тот же AES-256-GCM ключ что и
 * Telegram-боты (TG_TOKEN_ENC_KEY) — нет смысла плодить два ключа, оба
 * хранят boт-токены в одной БД.
 */

import { encryptToken, decryptToken } from "@/lib/tg/crypto";

export function encrypt(plain: string): string {
  return encryptToken(plain);
}

export function decrypt(cipher: string): string {
  return decryptToken(cipher);
}
