import { createHash, createHmac, timingSafeEqual } from "crypto";

/**
 * Утилиты для tracking-эндпоинтов.
 *
 * sha256-хеш IP — пишем в EmailEvent.ipHash вместо raw IP по privacy
 * (User-Agent оставляем — он нужен для понимания «мобильный/десктоп»).
 *
 * Salt берётся из ENV; если не задан — генерируем разный per-deployment
 * через JWT_SECRET (он у нас всегда есть). Главное чтобы один и тот же IP
 * давал один и тот же hash — для разовых анализов уникальных открытий.
 */
export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const salt = process.env.EMAIL_TRACKING_IP_SALT || process.env.JWT_SECRET || "default-salt";
  return createHash("sha256").update(ip + salt).digest("hex").slice(0, 32);
}

/**
 * Секрет для HMAC-подписи click-tracking URL. Защищает от open-redirect:
 * без подписи нельзя сформировать tracking-ссылку с произвольным destination URL.
 *
 * Если EMAIL_CLICK_SIGNING_SECRET не задан — fallback к JWT_SECRET (работает,
 * но плохо: при ротации JWT все ссылки в уже отправленных письмах ломаются).
 * В .env.example документировано задавать отдельным.
 */
function getClickSigningSecret(): string {
  return (
    process.env.EMAIL_CLICK_SIGNING_SECRET ||
    process.env.JWT_SECRET ||
    "default-click-secret"
  );
}

/**
 * Подписывает (recipientId, destinationUrl) → 16-байтный truncated HMAC-SHA256
 * в base64url. 128 бит достаточно — за время жизни ссылки (письмо) подобрать
 * невозможно.
 */
export function signClickUrl(recipientId: string, destinationUrl: string): string {
  const mac = createHmac("sha256", getClickSigningSecret())
    .update(`${recipientId}\n${destinationUrl}`)
    .digest();
  return mac
    .subarray(0, 16)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Constant-time verify. Возвращает true если sig валиден.
 * В legacy-режиме (CLICK_SIGNING_SECRET не задан и в письме signature
 * отсутствует) старые ссылки продолжают работать — это сознательно,
 * чтобы не сломать письма отправленные до релиза подписи.
 */
export function verifyClickSignature(
  recipientId: string,
  destinationUrl: string,
  providedSig: string | null
): boolean {
  if (!providedSig) return false;
  const expected = signClickUrl(recipientId, destinationUrl);
  if (expected.length !== providedSig.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(providedSig));
  } catch {
    return false;
  }
}

/**
 * Берёт IP из x-forwarded-for (первый), потом x-real-ip, потом null.
 * За nginx первая запись в forwarded — реальный клиент.
 */
export function extractIp(headers: Headers): string | null {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() ?? null;
  return headers.get("x-real-ip") ?? null;
}

/**
 * 1×1 прозрачный GIF в виде Buffer. Используется в open pixel.
 * Минимальный размер: 43 байта.
 */
export const TRACKING_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

export const TRACKING_GIF_HEADERS: HeadersInit = {
  "Content-Type": "image/gif",
  "Content-Length": String(TRACKING_GIF.length),
  // Никакого кеша — каждое открытие должно дёргать сервер.
  "Cache-Control": "no-cache, no-store, must-revalidate, private",
  Pragma: "no-cache",
  Expires: "0",
};
