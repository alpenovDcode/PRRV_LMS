/**
 * Умная UTM-ссылка для Telegram-бота (SaleBot-style).
 *
 * GET /g/<botUsername>/<slug>?utm_source=tg&utm_medium=p1&utm_campaign=igrai&utm_content=t6
 *
 * Telegram при открытии t.me/<bot>?start=<payload>&utm_source=... выбрасывает
 * все query-параметры, кроме `start`. Поэтому передать произвольный набор UTM
 * боту напрямую нельзя. Решение — наша редирект-страница: принимаем UTM,
 * генерируем короткий one-shot token, сохраняем `{slug, utm}` в Redis под
 * этим token'ом и редиректим на t.me/<bot>?start=<token>.
 *
 * Когда юзер нажимает Старт в боте, inbound.ts парсит payload как token,
 * достаёт сохранённые UTM, применяет к подписчику (client.utm_*) и
 * запускает scenario, как у обычной tracking-link.
 *
 * Преимущества перед статической t.me-ссылкой:
 *   • UTM не обрезаются Telegram'ом — приходят в карточку подписчика;
 *   • один slug может обслужить N разных utm-комбинаций без создания
 *     N отдельных tracking-link;
 *   • UTM из URL побеждают base-UTM ссылки (можно перебить под кампанию).
 */

import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { getRedisClient } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Префикс one-shot token'а в Telegram `start` payload — отличает «умные»
 *  редирект-ссылки от обычных slug'ов TgTrackingLink. */
const TOKEN_PREFIX = "p_";
/** TTL Redis-ключа в секундах. 7 дней — клиент может открыть ссылку позже. */
const TOKEN_TTL_SEC = 7 * 24 * 60 * 60;
/** Допустимые UTM-параметры (остальное игнорируем, чтобы не пихать мусор в БД). */
const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;

function redisKey(token: string): string {
  return `tg:promo:${token}`;
}

/** Структура, которую сохраняем в Redis. Сериализуем JSON-ом. */
export interface PromoTokenPayload {
  slug: string;
  utm: Record<string, string>;
  /** ISO-время создания токена — для отладки/анализа. */
  ts: string;
}

export async function GET(
  request: NextRequest,
  { params: paramsP }: { params: Promise<{ bot: string; slug: string }> }
) {
  const params = await paramsP;
  const botUsername = (params.bot ?? "").replace(/^@/, "");
  const slug = params.slug ?? "";

  // 1. Находим бота по username
  const bot = await db.tgBot.findFirst({
    where: { username: botUsername },
    select: { id: true, username: true, isActive: true },
  });
  if (!bot || !bot.isActive) {
    return new NextResponse("Бот не найден", { status: 404 });
  }

  // 2. Находим базовую tracking-link по слагу. Если не нашли — 404,
  //    чтобы случайные перебор-URL'ы не плодили пустые токены в Redis.
  const link = await db.tgTrackingLink.findUnique({
    where: { botId_slug: { botId: bot.id, slug } },
    select: { id: true, utm: true, expiresAt: true, clickCount: true },
  });
  if (!link) {
    return new NextResponse("Ссылка не найдена", { status: 404 });
  }
  if (link.expiresAt && link.expiresAt < new Date()) {
    return new NextResponse("Ссылка устарела", { status: 410 });
  }

  // 3. Мёрджим UTM: базовые из БД + query, query побеждает.
  const baseUtm = (link.utm as Record<string, unknown> | null) ?? {};
  const mergedUtm: Record<string, string> = {};
  for (const key of UTM_KEYS) {
    const fromBase = baseUtm[key];
    if (fromBase != null && String(fromBase).trim() !== "") {
      mergedUtm[key] = String(fromBase);
    }
  }
  const url = new URL(request.url);
  for (const key of UTM_KEYS) {
    const fromQuery = url.searchParams.get(key);
    if (fromQuery != null && fromQuery.trim() !== "") {
      mergedUtm[key] = fromQuery.trim().slice(0, 256);
    }
  }

  // 4. Генерируем одноразовый token. 22 hex chars + префикс p_ = 24 chars,
  //    влезает в Telegram-ограничение 64 chars на /start payload.
  const token = TOKEN_PREFIX + randomBytes(11).toString("hex");

  // 5. Сохраняем в Redis. JSON.stringify({slug, utm, ts}). TTL 7 дней.
  try {
    const redis = await getRedisClient();
    const payload: PromoTokenPayload = {
      slug,
      utm: mergedUtm,
      ts: new Date().toISOString(),
    };
    await redis.set(redisKey(token), JSON.stringify(payload), {
      EX: TOKEN_TTL_SEC,
    });
  } catch (e) {
    // Если Redis лёг — отдаём fallback: голая ссылка без UTM. Юзер всё равно
    // попадёт в бот по slug, просто без свежих UTM-меток.
    console.error("[g-redirect] redis set failed:", e);
    return NextResponse.redirect(
      `https://t.me/${botUsername}?start=${encodeURIComponent(slug)}`,
      { status: 302 }
    );
  }

  // 6. Best-effort: инкрементим clickCount у tracking-link. Не блокируем редирект.
  db.tgTrackingLink
    .update({
      where: { id: link.id },
      data: { clickCount: { increment: 1 } },
    })
    .catch(() => undefined);

  // 7. Редиректим в Telegram. start=<token> доедет до бота, Telegram отбросит
  //    остальные query (это норма).
  return NextResponse.redirect(
    `https://t.me/${botUsername}?start=${token}`,
    { status: 302 }
  );
}
