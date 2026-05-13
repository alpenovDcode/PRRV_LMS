// Media library listing endpoint.
//
// GET   ?kind=photo&q=foo&limit=50&cursor=<id>
//   Lists media files captured for this bot. Supports filtering by
//   kind and a free-text search across title + filename. Cursor-based
//   pagination, newest first (sorted by lastUsedAt fallback to createdAt).
//
// The bytes themselves are served by .../media/[fileId]/route.ts via
// Telegram's file CDN — this endpoint only deals with metadata.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-middleware";
import type { Prisma } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MEDIA_KINDS = new Set([
  "photo",
  "video",
  "voice",
  "video_note",
  "document",
  "audio",
  "animation",
]);

export async function GET(
  request: NextRequest,
  { params: paramsP }: { params: Promise<{ botId: string }> }
) {
  const params = await paramsP;
  return withAuth(
    request,
    async (req) => {
      const url = new URL(req.url);
      const kindParam = url.searchParams.get("kind");
      const kinds = kindParam
        ? kindParam.split(",").filter((k) => MEDIA_KINDS.has(k))
        : null;
      const q = (url.searchParams.get("q") ?? "").trim();
      const limit = Math.min(
        100,
        Math.max(1, parseInt(url.searchParams.get("limit") ?? "30", 10) || 30)
      );
      const cursor = url.searchParams.get("cursor") || null;

      const where: Prisma.TgMediaFileWhereInput = { botId: params.botId };
      if (kinds && kinds.length > 0) where.kind = { in: kinds };
      if (q) {
        where.OR = [
          { title: { contains: q, mode: "insensitive" } },
          { fileName: { contains: q, mode: "insensitive" } },
        ];
      }

      const rows = await db.tgMediaFile.findMany({
        where,
        // We sort by createdAt desc primarily for deterministic
        // pagination — lastUsedAt is a secondary signal exposed in
        // the response so the UI can re-rank for "recently used"
        // tabs without a second round-trip.
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: {
          id: true,
          fileId: true,
          fileUniqueId: true,
          kind: true,
          mimeType: true,
          fileSize: true,
          width: true,
          height: true,
          duration: true,
          title: true,
          fileName: true,
          thumbFileId: true,
          source: true,
          createdAt: true,
          lastUsedAt: true,
        },
      });
      const nextCursor = rows.length > limit ? rows[limit - 1].id : null;
      const items = rows.slice(0, limit);
      return NextResponse.json({
        success: true,
        data: {
          items,
          nextCursor,
          // Stable counts by kind — drives the kind-filter chips in UI.
          // Cheap because we have a (botId, kind, createdAt) index.
          countsByKind: await groupCount(params.botId),
        },
      });
    },
    { roles: ["admin"] }
  );
}

async function groupCount(botId: string): Promise<Record<string, number>> {
  const rows = await db.tgMediaFile.groupBy({
    by: ["kind"],
    where: { botId },
    _count: true,
  });
  const out: Record<string, number> = {};
  for (const r of rows) out[r.kind] = r._count;
  return out;
}
