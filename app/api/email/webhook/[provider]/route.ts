import { NextRequest, NextResponse } from "next/server";
import { getMarketingEmailProvider } from "@/lib/email/providers/factory";
import { applyEmailEvent } from "@/lib/email/webhooks/apply-event";

/**
 * POST /api/email/webhook/[provider]
 *
 * Универсальный приёмник webhook'ов от провайдера доставки.
 *
 * Поведение:
 *   1. Берём rawBody (нужен для HMAC).
 *   2. Дёргаем provider.verifyWebhookSignature(headers, rawBody). Если false → 401.
 *   3. Парсим через provider.parseWebhookEvent(json) → EmailEventData[].
 *   4. Применяем каждое событие через applyEmailEvent (дедуп + апдейты + suppression).
 *   5. Возвращаем 200 быстро — провайдер не любит долгие webhook'и (timeout у Unisender ~5с).
 *
 * Параметр [provider] (например /unisender, /yandex) сейчас не используется
 * для роутинга — мы дёргаем текущий провайдер из factory. Это сделано чтобы
 * один URL мог принимать webhooks от разных провайдеров (Евгений видит просто
 * один URL в кабинете Unisender).
 *
 * Errors:
 *   401 — невалидная подпись
 *   400 — невалидный JSON
 *   501 — провайдер не поддерживает webhook (Yandex)
 *
 * Производительность: все события обрабатываются последовательно, чтобы не
 * упереться в пул коннектов БД. Для крупных батчей (Unisender может прислать
 * 100+ событий за раз) делаем await + ловим ошибки по одному — одно битое
 * событие не валит остальные.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const provider = getMarketingEmailProvider();

  if (!provider.parseWebhookEvent || !provider.verifyWebhookSignature) {
    return NextResponse.json(
      {
        ok: false,
        error: `Provider ${provider.name} does not support webhooks`,
      },
      { status: 501 }
    );
  }

  const rawBody = await request.text();

  if (!provider.verifyWebhookSignature(request.headers, rawBody)) {
    return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const events = provider.parseWebhookEvent(payload);

  let processed = 0;
  let duplicates = 0;
  let errors = 0;

  for (const event of events) {
    try {
      const res = await applyEmailEvent(event);
      if (res.inserted) processed++;
      else if (res.reason === "duplicate") duplicates++;
    } catch (e) {
      errors++;
      console.error(`[email-webhook/${provider.name}] event failed:`, e, event);
    }
  }

  return NextResponse.json({
    ok: true,
    received: events.length,
    processed,
    duplicates,
    errors,
  });
}
