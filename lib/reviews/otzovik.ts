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
  // IDs already in DB — used to skip individual page fetches for known reviews
  existingIds: Set<string> = new Set(),
  // IDs that already have a saved response — no need to re-fetch their pages
  alreadyResponded: Set<string> = new Set()
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
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) break;
      html = await res.text();
    } catch {
      break;
    }

    const reviewBlocks = html.split(/(?=<[^>]+itemtype="http:\/\/schema\.org\/Review")/);
    let gotNew = false;
    const pageReviews: ScrapedReview[] = [];
    // Only fetch individual pages for reviews that don't have a response cached
    const idsNeedingResponse: string[] = [];

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
      const publishedAt = dateMatch ? new Date(dateMatch[1]) : new Date();

      const commentCountMatch = block.match(/itemprop="commentCount">(\d+)</);
      const commentCount = parseInt(commentCountMatch?.[1] ?? "0", 10);

      const review: ScrapedReview = {
        externalId,
        author,
        rating,
        text,
        url: REVIEW_URL(externalId),
        publishedAt,
      };
      pageReviews.push(review);

      // Fetch individual page only if: has comments AND response not already cached
      if (commentCount > 0 && !alreadyResponded.has(externalId)) {
        idsNeedingResponse.push(externalId);
      }

      if (!existingIds.has(externalId)) gotNew = true;
    }

    // Fetch official responses only for reviews that need it
    if (idsNeedingResponse.length > 0) {
      const responseMap = await fetchOfficialResponses(idsNeedingResponse);
      for (const r of pageReviews) {
        const fresh = responseMap.get(r.externalId);
        if (fresh) r.businessResponse = fresh;
      }
    }

    reviews.push(...pageReviews);
    if (!gotNew && page > 1) break; // all reviews on this page were already known — stop
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
          // skip on error
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
