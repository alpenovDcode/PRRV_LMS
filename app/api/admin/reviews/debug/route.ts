import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { UserRole } from "@prisma/client";
import { ApiResponse } from "@/types";
import { proxyFetch, isProxyConfigured } from "@/lib/reviews/proxy-fetch";

/**
 * Диагностический эндпоинт для отладки скрапинга отзывов.
 * Не пишет в БД — просто фетчит сайты и возвращает что нашёл.
 *
 * GET /api/admin/reviews/debug?source=otzovik
 * GET /api/admin/reviews/debug?source=yandex_maps
 */
export async function GET(request: NextRequest) {
  return withAuth(
    request,
    async () => {
      const url = new URL(request.url);
      const source = url.searchParams.get("source") ?? "otzovik";

      try {
        if (source === "otzovik") {
          return await debugOtzovik();
        } else if (source === "yandex_maps") {
          return await debugYandex();
        }
        return NextResponse.json<ApiResponse>({
          success: false,
          error: { code: "BAD_REQUEST", message: "source: otzovik | yandex_maps" },
        });
      } catch (e) {
        return NextResponse.json<ApiResponse>({
          success: false,
          error: { code: "INTERNAL_ERROR", message: String(e) },
        });
      }
    },
    { roles: [UserRole.admin] }
  );
}

async function debugOtzovik() {
  const targetUrl = "https://otzovik.com/reviews/akademiya_proriv-elizaveta_vasileva/";
  const res = await proxyFetch(targetUrl, { country: "RU", timeoutMs: 30_000 });
  const html = await res.text();
  const blocks = html.split(/(?=<[^>]+itemtype="http:\/\/schema\.org\/Review")/);

  const reviews: Array<{
    externalId: string | null;
    rawDatePublished: string | null;
    visibleDate: string | null;
    author: string | null;
  }> = [];

  for (const block of blocks.slice(0, 8)) {
    const idMatch = block.match(/class="review-title"\s+href="\/review_(\d+)\.html"/);
    const dateAttr = block.match(/itemprop="datePublished"\s+content="([^"]+)"/);
    const visibleDate1 = block.match(/<div class="review-postdate"[^>]*>([\s\S]*?)<\/div>/);
    const visibleDate2 = block.match(/datePublished[^>]*>([^<]+)</);
    const author = block.match(/itemprop="name">([^<]+)<\/span>/);

    if (idMatch) {
      reviews.push({
        externalId: idMatch[1],
        rawDatePublished: dateAttr?.[1] ?? null,
        visibleDate: (visibleDate1?.[1] ?? visibleDate2?.[1] ?? "").replace(/<[^>]+>/g, "").trim() || null,
        author: author?.[1]?.trim() ?? null,
      });
    }
  }

  return NextResponse.json<ApiResponse>({
    success: true,
    data: {
      source: "otzovik",
      proxyConfigured: isProxyConfigured(),
      status: res.status,
      htmlLength: html.length,
      blockCount: blocks.length,
      sampleReviews: reviews,
    },
  });
}

async function debugYandex() {
  const ORG_ID = "52378530429";
  const ORG_SLUG = "akademiya_proryv";
  const variants = [
    { name: "by_time", url: `https://yandex.kz/maps/org/${ORG_SLUG}/${ORG_ID}/reviews/?ranking=by_time` },
    { name: "yandex.ru", url: `https://yandex.ru/maps/org/${ORG_SLUG}/${ORG_ID}/reviews/?ranking=by_time` },
  ];

  const results = await Promise.all(
    variants.map(async (v) => {
      try {
        const res = await proxyFetch(v.url, {
          js: true,
          ajaxWait: true,
          pageWait: 3000,
          country: "RU",
          timeoutMs: 120_000,
        });
        const html = await res.text();

        const chunks = html.split(/"reviewId":/);
        const allReviews: Array<{
          externalId: string;
          updatedTime: string | null;
          author: string | null;
          rating: number;
        }> = [];
        const seen = new Set<string>();

        for (let i = 1; i < chunks.length; i++) {
          const chunk = chunks[i];
          const idMatch = chunk.match(/^"([^"]+)"/);
          const externalId = idMatch?.[1];
          if (!externalId || seen.has(externalId)) continue;

          const ratingMatch = chunk.match(/"rating":(\d)/);
          const rating = ratingMatch ? parseInt(ratingMatch[1], 10) : null;
          if (!rating) continue;

          seen.add(externalId);

          const authorMatch = chunk.match(/"author":\{"name":"([^"]+)"/);
          const dateMatch = chunk.match(/"updatedTime":"([^"]+)"/);

          allReviews.push({
            externalId,
            updatedTime: dateMatch?.[1] ?? null,
            author: authorMatch?.[1] ?? null,
            rating,
          });
        }

        // Сортируем по дате DESC чтобы сразу было видно есть ли свежие отзывы.
        allReviews.sort((a, b) => (b.updatedTime ?? "").localeCompare(a.updatedTime ?? ""));

        return {
          variant: v.name,
          url: v.url,
          status: res.status,
          htmlLength: html.length,
          chunkCount: chunks.length,
          uniqueReviewsParsed: allReviews.length,
          top10ByDate: allReviews.slice(0, 10),
        };
      } catch (e) {
        return { variant: v.name, url: v.url, error: String(e) };
      }
    })
  );

  return NextResponse.json<ApiResponse>({
    success: true,
    data: { source: "yandex_maps", proxyConfigured: isProxyConfigured(), results },
  });
}
