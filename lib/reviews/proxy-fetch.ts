/**
 * Прокси-обёртка над fetch для скрапинга через Crawlbase.
 *
 * Зачем: с продакшн-сервера (Vercel/датацентр) Otzovik и Яндекс Карты
 * детектят бота и возвращают пустые/заблокированные страницы. Crawlbase
 * проксирует запрос через резидентский IP + умеет рендерить JS.
 *
 * Без токенов (локальная разработка) — обычный fetch напрямую,
 * чтобы не палить free-tier на dev-окружении.
 *
 * Free tier: 1000 запросов/месяц на каждый токен.
 *
 * Env:
 *   CRAWLBASE_NORMAL_TOKEN — для статичного HTML (Otzovik)
 *   CRAWLBASE_JS_TOKEN     — для JS-рендеринга (Яндекс Карты)
 */

interface ProxyFetchOptions {
  /** Использовать JS-рендеринг (нужен для Яндекс Карт). */
  js?: boolean;
  /** Таймаут в мс (по умолчанию 30 сек, при JS-рендере имеет смысл больше). */
  timeoutMs?: number;
  /** Код страны прокси (ru, kz, us...). */
  country?: string;
  /** Ждать AJAX-запросы перед снятием HTML (для SPA). */
  ajaxWait?: boolean;
  /** Доп. задержка после рендера в мс. */
  pageWait?: number;
}

const CRAWLBASE_ENDPOINT = "https://api.crawlbase.com/";

export async function proxyFetch(
  targetUrl: string,
  options: ProxyFetchOptions = {}
): Promise<Response> {
  const { js = false, timeoutMs = js ? 60_000 : 30_000, country, ajaxWait, pageWait } = options;

  const token = js
    ? process.env.CRAWLBASE_JS_TOKEN
    : process.env.CRAWLBASE_NORMAL_TOKEN;

  // Fallback на прямой fetch — для локальной разработки без токенов.
  if (!token) {
    return fetch(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "ru-RU,ru;q=0.9",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  }

  const params = new URLSearchParams({ token, url: targetUrl });
  if (country) params.set("country", country);
  if (js && ajaxWait) params.set("ajax_wait", "true");
  if (js && pageWait) params.set("page_wait", String(pageWait));

  return fetch(`${CRAWLBASE_ENDPOINT}?${params.toString()}`, {
    signal: AbortSignal.timeout(timeoutMs),
  });
}

export function isProxyConfigured(): { normal: boolean; js: boolean } {
  return {
    normal: !!process.env.CRAWLBASE_NORMAL_TOKEN,
    js: !!process.env.CRAWLBASE_JS_TOKEN,
  };
}
