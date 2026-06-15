import type { ScrapedReview } from "./otzovik";
import { parseReviewDate } from "./date-utils";

const ORG_ID = "52378530429";
const ORG_SLUG = "akademiya_proryv";
const BASE_URL = `https://yandex.kz/maps/org/${ORG_SLUG}/${ORG_ID}/reviews/`;

// ?ranking=by_time — сортировка по дате (новые сверху). Без этого Яндекс
// сортирует «по умолчанию» (релевантность), и свежие отзывы попадают
// в конец списка, который мы можем не успеть докрутить.
function buildUrl(page: number): string {
  const params = new URLSearchParams({ ranking: "by_time" });
  if (page > 1) params.set("page", String(page));
  return `${BASE_URL}?${params.toString()}`;
}

export async function scrapeYandexMaps(
  maxPages = 5,
  existingIds: Set<string> = new Set()
): Promise<ScrapedReview[]> {
  const reviews: ScrapedReview[] = [];
  const seen = new Set<string>();

  for (let page = 1; page <= maxPages; page++) {
    const url = buildUrl(page);
    let html: string;
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "ru-RU,ru;q=0.9",
          "Cache-Control": "no-cache",
        },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) break;
      html = await res.text();
    } catch {
      break;
    }

    // Карта ответов организации. В JSON это сосед reviewId:
    // "businessComment":{"text":"...","updatedTime":"..."},"reviewId":"ID"
    const responseMap = new Map<string, string>();
    const responseRegex = /"businessComment":\{"text":"((?:[^"\\]|\\.)*)"[^}]*\},"reviewId":"([^"]+)"/g;
    for (const match of html.matchAll(responseRegex)) {
      try {
        const text = JSON.parse(`"${match[1]}"`);
        responseMap.set(match[2], text);
      } catch {
        responseMap.set(match[2], match[1].replace(/\\n/g, "\n").replace(/\\"/g, '"'));
      }
    }

    const chunks = html.split(/"reviewId":/);
    if (chunks.length <= 1) break;

    let gotNew = false;
    let parsedOnPage = 0;
    for (let i = 1; i < chunks.length; i++) {
      const chunk = chunks[i];

      const idMatch = chunk.match(/^"([^"]+)"/);
      const externalId = idMatch?.[1];
      if (!externalId) continue;

      // Сначала проверяем что это реальный отзыв (есть rating).
      // Чанки от businessComment попадают сюда же, но не имеют рейтинга —
      // их нужно пропустить ДО добавления в seen, иначе настоящий отзыв
      // с этим же ID может быть пропущен на другой странице.
      const ratingMatch = chunk.match(/"rating":(\d)/);
      const rating = parseInt(ratingMatch?.[1] ?? "0", 10);
      if (!rating) continue;

      if (seen.has(externalId)) continue;
      seen.add(externalId);

      const isNew = !existingIds.has(externalId);

      const authorMatch = chunk.match(/"author":\{"name":"([^"]+)"/);
      const author = authorMatch?.[1] || "Аноним";

      const textMatch = chunk.match(/"text":"((?:[^"\\]|\\.)*)"/);
      let text = "";
      if (textMatch) {
        try {
          text = JSON.parse(`"${textMatch[1]}"`);
        } catch {
          text = textMatch[1].replace(/\\n/g, " ").replace(/\\"/g, '"').trim();
        }
      }
      if (!text) continue;

      const dateMatch = chunk.match(/"updatedTime":"([^"]+)"/);
      const publishedAt = parseReviewDate(dateMatch?.[1]);

      const reviewUrl = `${BASE_URL}?reviewId=${encodeURIComponent(externalId)}`;
      const businessResponse = responseMap.get(externalId);

      reviews.push({ externalId, author, rating, text, url: reviewUrl, publishedAt, businessResponse });
      parsedOnPage++;
      if (isNew) gotNew = true;
    }

    // Если на странице ничего не распарсилось — структура изменилась или
    // страница пустая, дальше нет смысла идти.
    if (parsedOnPage === 0) break;
    // Все распарсенные отзывы на этой странице уже в БД — следующие тоже
    // будут известны (отзывы отсортированы по дате).
    if (!gotNew) break;
  }

  return reviews;
}
