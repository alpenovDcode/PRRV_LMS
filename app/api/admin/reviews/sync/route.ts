import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";
import { scrapeOtzovik } from "@/lib/reviews/otzovik";
import { scrapeYandexMaps } from "@/lib/reviews/yandex-maps";

export async function POST(request: NextRequest) {
  return withAuth(
    request,
    async () => {
      try {
        const body = await request.json().catch(() => ({}));
        const sources: string[] = body.sources ?? ["otzovik", "yandex_maps"];

        const results: Record<string, { added: number; updated: number; errors: string[] }> = {};

        if (sources.includes("otzovik")) {
          const errors: string[] = [];
          let added = 0;
          let updated = 0;
          try {
            // Load existing otzovik IDs and which ones already have a response saved
            const existing = await db.externalReview.findMany({
              where: { source: "otzovik" },
              select: { externalId: true, businessResponse: true },
            });
            const existingIds = new Set<string>(
              existing.filter((r) => r.externalId != null).map((r) => r.externalId!)
            );
            const alreadyResponded = new Set<string>(
              existing
                .filter((r) => r.businessResponse != null && r.externalId != null)
                .map((r) => r.externalId!)
            );

            const scraped = await scrapeOtzovik(10, existingIds, alreadyResponded);
            for (const r of scraped) {
              try {
                const isNew = !existingIds.has(r.externalId);
                await db.externalReview.upsert({
                  where: { source_externalId: { source: "otzovik", externalId: r.externalId } },
                  create: {
                    source: "otzovik",
                    externalId: r.externalId,
                    author: r.author,
                    rating: r.rating,
                    text: r.text,
                    url: r.url,
                    publishedAt: r.publishedAt,
                    businessResponse: r.businessResponse ?? null,
                  },
                  update: {
                    author: r.author,
                    rating: r.rating,
                    text: r.text,
                    url: r.url,
                    publishedAt: r.publishedAt,
                    // Only overwrite response if we actually fetched a fresh one
                    ...(r.businessResponse != null ? { businessResponse: r.businessResponse } : {}),
                    fetchedAt: new Date(),
                  },
                });
                if (isNew) added++; else updated++;
              } catch (e) {
                errors.push(String(e));
              }
            }
          } catch (e) {
            errors.push(String(e));
          }
          results.otzovik = { added, updated, errors };
        }

        if (sources.includes("yandex_maps")) {
          const errors: string[] = [];
          let added = 0;
          let updated = 0;
          try {
            const existing = await db.externalReview.findMany({
              where: { source: "yandex_maps" },
              select: { externalId: true },
            });
            const existingIds = new Set<string>(
              existing.filter((r) => r.externalId != null).map((r) => r.externalId!)
            );

            const scraped = await scrapeYandexMaps(10, existingIds);
            for (const r of scraped) {
              try {
                const isNew = !existingIds.has(r.externalId);
                await db.externalReview.upsert({
                  where: { source_externalId: { source: "yandex_maps", externalId: r.externalId } },
                  create: {
                    source: "yandex_maps",
                    externalId: r.externalId,
                    author: r.author,
                    rating: r.rating,
                    text: r.text,
                    url: r.url,
                    publishedAt: r.publishedAt,
                    businessResponse: r.businessResponse ?? null,
                  },
                  update: {
                    author: r.author,
                    rating: r.rating,
                    text: r.text,
                    url: r.url,
                    publishedAt: r.publishedAt,
                    businessResponse: r.businessResponse ?? null,
                    fetchedAt: new Date(),
                  },
                });
                if (isNew) added++; else updated++;
              } catch (e) {
                errors.push(String(e));
              }
            }
          } catch (e) {
            errors.push(String(e));
          }
          results.yandex_maps = { added, updated, errors };
        }

        return NextResponse.json<ApiResponse>({ success: true, data: results });
      } catch (error) {
        console.error("Reviews sync error:", error);
        return NextResponse.json<ApiResponse>(
          { success: false, error: { code: "INTERNAL_ERROR", message: "Ошибка синхронизации" } },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin] }
  );
}
