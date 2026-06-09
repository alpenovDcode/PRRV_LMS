import type { ScrapedReview } from "./otzovik";

const ORG_ID = "52378530429";
const ORG_SLUG = "akademiya_proryv";
const BASE_URL = `https://yandex.kz/maps/org/${ORG_SLUG}/${ORG_ID}/reviews/`;

export async function scrapeYandexMaps(
  maxPages = 5,
  existingIds: Set<string> = new Set()
): Promise<ScrapedReview[]> {
  const reviews: ScrapedReview[] = [];
  const seen = new Set<string>();

  for (let page = 1; page <= maxPages; page++) {
    const url = page === 1 ? BASE_URL : `${BASE_URL}?page=${page}`;
    let html: string;
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "ru-RU,ru;q=0.9",
        },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) break;
      html = await res.text();
    } catch {
      break;
    }

    // Build businessResponse map: businessComment comes just before each reviewId in the JSON
    // Pattern: "businessComment":{"text":"...","updatedTime":"..."},"reviewId":"ID"
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
    for (let i = 1; i < chunks.length; i++) {
      const chunk = chunks[i];

      const idMatch = chunk.match(/^"([^"]+)"/);
      const externalId = idMatch?.[1];
      if (!externalId || seen.has(externalId)) continue;
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

      const ratingMatch = chunk.match(/"rating":(\d)/);
      const rating = parseInt(ratingMatch?.[1] ?? "0", 10);
      if (!rating) continue;

      const dateMatch = chunk.match(/"updatedTime":"([^"]+)"/);
      const publishedAt = dateMatch ? new Date(dateMatch[1]) : new Date();

      const reviewUrl = `${BASE_URL}?reviewId=${encodeURIComponent(externalId)}`;
      const businessResponse = responseMap.get(externalId);

      reviews.push({ externalId, author, rating, text, url: reviewUrl, publishedAt, businessResponse });
      if (isNew) gotNew = true;
    }

    if (!gotNew) break;
  }

  return reviews;
}
