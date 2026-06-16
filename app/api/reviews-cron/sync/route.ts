// Cron-эндпоинт для автосинка отзывов.
//
// Authentication: bearer token в `Authorization: Bearer <REVIEWS_CRON_SECRET>`.
// Дёргается из docker-compose сервиса reviews-cron раз в сутки.

import { NextRequest, NextResponse } from "next/server";
import { syncReviews, SyncSource } from "@/lib/reviews/sync";
import { timingSafeEqual } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function tokenMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
export async function GET(request: NextRequest) {
  return handle(request);
}

async function handle(request: NextRequest) {
  const expected = process.env.REVIEWS_CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "REVIEWS_CRON_SECRET not configured" },
      { status: 503 }
    );
  }
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : auth;
  if (!token || !tokenMatches(token, expected)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const sourceParam = url.searchParams.get("source") as SyncSource | null;
  const sources: SyncSource[] = sourceParam
    ? [sourceParam]
    : ["otzovik", "yandex_maps"];

  const startedAt = Date.now();
  try {
    const results = await syncReviews(sources);
    const tookMs = Date.now() - startedAt;
    console.log(
      `[reviews-cron] done in ${tookMs}ms — ${JSON.stringify(results)}`
    );
    return NextResponse.json({ ok: true, tookMs, results });
  } catch (e) {
    console.error("[reviews-cron] failed", e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
