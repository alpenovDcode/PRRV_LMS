import { parseReviewDate } from "./date-utils";

export interface ScrapedReview {
  externalId: string;
  author: string;
  rating: number; // 1-5
  text: string;
  url: string;
  publishedAt: Date;
  businessResponse?: string;
}

const BASE_URL = "https://otzovik.com/reviews/akademiya_proriv-elizaveta_vasileva/";
const REVIEW_URL = (id: string) => `https://otzovik.com/review_${id}.html`;

export async function scrapeOtzovik(
  maxPages = 5,
  existingIds: Set<string> = new Set(),
  alreadyResponded: Set<string> = new Set()
): Promise<ScrapedReview[]> {
  const reviews: ScrapedReview[] = [];
  const seen = new Set<string>();
  const idsNeedingResponse: string[] = [];

  // Фаза 1: обходим все страницы и собираем метаданные отзывов.
  // Индивидуальные запросы за ответами делаем только ПОСЛЕ — иначе Otzovik
  // блокирует IP после ~40 быстрых запросов и страница 2 уже не отдаётся.
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
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) break;
      html = await res.text();
    } catch {
      break;
    }

    const reviewBlocks = html.split(/(?=<[^>]+itemtype="http:\/\/schema\.org\/Review")/);
    let gotNew = false;

    for (const block of reviewBlocks) {
      const idMatch = block.match(/class="review-title"\s+href="\/review_(\d+)\.html"/);
      const externalId = idMatch?.[1];
      if (!externalId || seen.has(externalId)) continue;
      seen.add(externalId);

      const ratingMatch = block.match(/itemprop="ratingValue"\s+content="([\d.]+)"/);
      const rating = parseFloat(ratingMatch?.[1] ?? "0");
      if (!rating) continue;

      const authorMatch = block.match(/itemprop="name">([^<]+)<\/span>/);
      const author = authorMatch?.[1]?.trim() || "Аноним";

      const textMatch = block.match(/itemprop="description">([\s\S]*?)<\/div>/);
      const text = stripTags(textMatch?.[1] ?? "").trim();
      if (!text) continue;

      const dateMatch = block.match(/itemprop="datePublished"\s+content="([^"]+)"/);
      const publishedAt = parseReviewDate(dateMatch?.[1]);

      const commentCountMatch = block.match(/itemprop="commentCount">(\d+)</);
      const commentCount = parseInt(commentCountMatch?.[1] ?? "0", 10);

      reviews.push({ externalId, author, rating, text, url: REVIEW_URL(externalId), publishedAt });

      if (commentCount > 0 && !alreadyResponded.has(externalId)) {
        idsNeedingResponse.push(externalId);
      }

      if (!existingIds.has(externalId)) gotNew = true;
    }

    if (!gotNew && page > 1) break;

    // Пауза между запросами страниц, чтобы не получить бан
    if (page < maxPages) {
      await new Promise((r) => setTimeout(r, 1_200));
    }
  }

  // Фаза 2: докачиваем ответы организации уже после того, как все страницы собраны
  if (idsNeedingResponse.length > 0) {
    const responseMap = await fetchOfficialResponses(idsNeedingResponse);
    for (const r of reviews) {
      const fresh = responseMap.get(r.externalId);
      if (fresh) r.businessResponse = fresh;
    }
  }

  return reviews;
}

async function fetchOfficialResponses(ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const BATCH_SIZE = 5;
  const DELAY_MS = 150;

  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (id) => {
        try {
          const res = await fetch(REVIEW_URL(id), {
            headers: {
              "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
              "Accept-Language": "ru-RU,ru;q=0.9",
            },
            signal: AbortSignal.timeout(12_000),
          });
          if (!res.ok) return;
          const html = await res.text();
          const response = extractOfficialComment(html);
          if (response) map.set(id, response);
        } catch {
          // пропускаем при ошибке
        }
      })
    );
    if (i + BATCH_SIZE < ids.length) {
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }
  return map;
}

function extractOfficialComment(html: string): string | undefined {
  const officialMatch = html.match(/class="comment official"[\s\S]*?<div class="comment-body">([\s\S]*?)<\/div>/);
  if (!officialMatch) return undefined;
  return stripTags(officialMatch[1]).trim() || undefined;
}

function stripTags(html: string): string {
  return html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
