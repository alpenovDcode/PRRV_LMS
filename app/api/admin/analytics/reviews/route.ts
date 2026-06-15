import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { UserRole } from "@prisma/client";
import { ApiResponse } from "@/types";

function parseDate(s: string | null): Date | undefined {
  if (!s) return undefined;
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : d;
}

function sentiment(rating: number): "positive" | "neutral" | "negative" {
  if (rating >= 4) return "positive";
  if (rating >= 3) return "neutral";
  return "negative";
}

export async function GET(request: NextRequest) {
  return withAuth(
    request,
    async () => {
      try {
        const url = new URL(request.url);
        const from = parseDate(url.searchParams.get("from"));
        const to = parseDate(url.searchParams.get("to"));
        const source = url.searchParams.get("source") || undefined;

        const where: {
          source?: string;
          publishedAt?: { gte?: Date; lte?: Date };
        } = {};
        if (source) where.source = source;
        if (from || to) {
          where.publishedAt = {};
          if (from) where.publishedAt.gte = from;
          if (to) where.publishedAt.lte = to;
        }

        const reviews = await db.externalReview.findMany({
          where,
          orderBy: { publishedAt: "desc" },
          select: {
            id: true,
            source: true,
            author: true,
            rating: true,
            text: true,
            url: true,
            publishedAt: true,
            fetchedAt: true,
            businessResponse: true,
          },
        });

        // Общий счёт по источникам без фильтра по дате — чтобы в UI было
        // видно, сколько всего отзывов в БД vs сколько попало в текущий период.
        const totalsBySource = await db.externalReview.groupBy({
          by: ["source"],
          _count: { _all: true },
          _max: { publishedAt: true },
        });
        const dbTotals = totalsBySource.map((g) => ({
          source: g.source,
          count: g._count._all,
          latestPublishedAt: g._max.publishedAt,
        }));
        const dbTotal = dbTotals.reduce((acc, g) => acc + g.count, 0);

        const bySource = new Map<string, { count: number; ratingSum: number; ratingN: number; responded: number }>();
        const monthMap = new Map<string, { otzovik: number; yandex_maps: number }>();
        const ratingDist = Array.from({ length: 5 }, (_, i) => ({ rating: i + 1, count: 0 }));
        let sentimentPositive = 0;
        let sentimentNeutral = 0;
        let sentimentNegative = 0;
        let respondedTotal = 0;

        for (const r of reviews) {
          const src = r.source;
          if (!bySource.has(src)) bySource.set(src, { count: 0, ratingSum: 0, ratingN: 0, responded: 0 });
          const s = bySource.get(src)!;
          s.count++;
          s.ratingSum += r.rating;
          s.ratingN++;

          if (r.businessResponse) {
            s.responded++;
            respondedTotal++;
          }

          const d = new Date(r.publishedAt);
          const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          if (!monthMap.has(monthKey)) monthMap.set(monthKey, { otzovik: 0, yandex_maps: 0 });
          const bucket = monthMap.get(monthKey)!;
          if (src === "otzovik") bucket.otzovik++;
          else if (src === "yandex_maps") bucket.yandex_maps++;

          const rounded = Math.min(5, Math.max(1, Math.round(r.rating)));
          ratingDist[rounded - 1].count++;

          const s_ = sentiment(r.rating);
          if (s_ === "positive") sentimentPositive++;
          else if (s_ === "neutral") sentimentNeutral++;
          else sentimentNegative++;
        }

        const perSource = Array.from(bySource.entries()).map(([src, s]) => ({
          source: src,
          count: s.count,
          avgRating: s.ratingN > 0 ? +(s.ratingSum / s.ratingN).toFixed(2) : null,
          respondedCount: s.responded,
          responseRate: s.count > 0 ? Math.round((s.responded / s.count) * 100) : 0,
        }));

        const perMonth = Array.from(monthMap.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([month, v]) => ({ month, ...v }));

        const totalRatingSum = reviews.reduce((a: number, r) => a + r.rating, 0);
        const avgRating = reviews.length > 0 ? +(totalRatingSum / reviews.length).toFixed(2) : null;
        const lastFetch = reviews[0]?.fetchedAt ?? null;

        return NextResponse.json<ApiResponse>({
          success: true,
          data: {
            total: reviews.length,
            dbTotal,
            dbTotals,
            avgRating,
            respondedTotal,
            responseRate: reviews.length > 0 ? Math.round((respondedTotal / reviews.length) * 100) : 0,
            sentiment: {
              positive: sentimentPositive,
              neutral: sentimentNeutral,
              negative: sentimentNegative,
            },
            perSource,
            ratingDistribution: ratingDist,
            perMonth,
            lastFetchedAt: lastFetch,
            reviews: reviews.map((r) => ({
              id: r.id,
              source: r.source,
              author: r.author,
              rating: r.rating,
              text: r.text,
              url: r.url,
              publishedAt: r.publishedAt,
              businessResponse: r.businessResponse,
            })),
          },
        });
      } catch (error) {
        console.error("Reviews analytics error:", error);
        return NextResponse.json<ApiResponse>(
          { success: false, error: { code: "INTERNAL_ERROR", message: "Не удалось получить аналитику отзывов" } },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}
