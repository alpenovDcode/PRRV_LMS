import { db } from "@/lib/db";
import { scrapeOtzovik } from "./otzovik";
import { scrapeYandexMaps } from "./yandex-maps";

export type SyncSource = "otzovik" | "yandex_maps";

export interface SyncResult {
  added: number;
  updated: number;
  errors: string[];
}

/**
 * Синхронизирует отзывы с указанных источников: скрапит и апсертит в БД.
 * Используется и из админ-ручки (с auth), и из cron-эндпоинта (с bearer).
 */
export async function syncReviews(
  sources: SyncSource[]
): Promise<Record<string, SyncResult>> {
  const results: Record<string, SyncResult> = {};

  if (sources.includes("otzovik")) {
    results.otzovik = await syncOtzovik();
  }
  if (sources.includes("yandex_maps")) {
    results.yandex_maps = await syncYandexMaps();
  }

  return results;
}

async function syncOtzovik(): Promise<SyncResult> {
  const errors: string[] = [];
  let added = 0;
  let updated = 0;
  try {
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
            // Перезаписываем ответ только если реально получили свежий
            ...(r.businessResponse != null ? { businessResponse: r.businessResponse } : {}),
            fetchedAt: new Date(),
          },
        });
        if (isNew) added++;
        else updated++;
      } catch (e) {
        errors.push(String(e));
      }
    }
  } catch (e) {
    errors.push(String(e));
  }
  return { added, updated, errors };
}

async function syncYandexMaps(): Promise<SyncResult> {
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

    // 1 страница — на ней ~71 отзыв, JS-рендер занимает ~30-60 сек.
    const scraped = await scrapeYandexMaps(1, existingIds);
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
        if (isNew) added++;
        else updated++;
      } catch (e) {
        errors.push(String(e));
      }
    }
  } catch (e) {
    errors.push(String(e));
  }
  return { added, updated, errors };
}
