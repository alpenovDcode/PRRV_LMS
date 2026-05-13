// Cursor-paginated message history for a single subscriber.
// Sibling of `..route.ts` (which keeps its existing shape: first-50 + state).
// This endpoint is dedicated to the lead-chat infinite-scroll feed.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-middleware";
import { collectSourceRefs } from "@/lib/tg/chat-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function GET(
  request: NextRequest,
  { params: paramsP }: { params: Promise<{ botId: string; subscriberId: string }> }
) {
  const params = await paramsP;
  return withAuth(
    request,
    async (req) => {
      const url = new URL(req.url);
      const cursor = url.searchParams.get("cursor");
      const limitParam = url.searchParams.get("limit");
      const limit = (() => {
        const n = Number.parseInt(limitParam ?? "", 10);
        if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
        return Math.min(MAX_LIMIT, n);
      })();

      // Confirm subscriber belongs to bot (defense in depth — admin-only,
      // but we still don't want cross-bot data leaks via id-guessing).
      const sub = await db.tgSubscriber.findFirst({
        where: { id: params.subscriberId, botId: params.botId },
        select: { id: true },
      });
      if (!sub) {
        return NextResponse.json(
          { success: false, error: { code: "NOT_FOUND", message: "Subscriber not found" } },
          { status: 404 }
        );
      }

      // Strategy: query DESC by createdAt, optionally constrained to "older
      // than the cursor row". Fetch limit+1 to know if a previous page exists.
      // Then reverse on the way out so the UI gets chronological ASC.
      let cursorRow: { createdAt: Date; id: string } | null = null;
      if (cursor) {
        cursorRow = await db.tgMessage.findFirst({
          where: { id: cursor, subscriberId: sub.id },
          select: { id: true, createdAt: true },
        });
        if (!cursorRow) {
          // Stale cursor — just return the latest page.
        }
      }

      const where = cursorRow
        ? {
            subscriberId: sub.id,
            OR: [
              { createdAt: { lt: cursorRow.createdAt } },
              {
                createdAt: cursorRow.createdAt,
                id: { lt: cursorRow.id },
              },
            ],
          }
        : { subscriberId: sub.id };

      const rowsDesc = await db.tgMessage.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit + 1,
      });

      const hasMore = rowsDesc.length > limit;
      const sliced = hasMore ? rowsDesc.slice(0, limit) : rowsDesc;
      const items = [...sliced].reverse(); // chronological ASC
      const nextCursor = hasMore ? sliced[sliced.length - 1].id : null;

      // Resolve flow / broadcast names referenced by this page so the
      // <SourcePill /> doesn't have to fan out N follow-up queries.
      const { flowIds, broadcastIds } = collectSourceRefs(
        items.map((m) => ({ sourceType: m.sourceType, sourceId: m.sourceId }))
      );
      const [flows, broadcasts] = await Promise.all([
        flowIds.length
          ? db.tgFlow.findMany({
              where: { id: { in: flowIds }, botId: params.botId },
              select: { id: true, name: true },
            })
          : Promise.resolve([] as { id: string; name: string }[]),
        broadcastIds.length
          ? db.tgBroadcast.findMany({
              where: { id: { in: broadcastIds }, botId: params.botId },
              select: { id: true, name: true },
            })
          : Promise.resolve([] as { id: string; name: string }[]),
      ]);
      const flowsById = Object.fromEntries(flows.map((f) => [f.id, f.name]));
      const broadcastsById = Object.fromEntries(broadcasts.map((b) => [b.id, b.name]));

      // Total count for the subscriber — cheap thanks to the
      // (subscriberId, createdAt) index.
      const total = await db.tgMessage.count({ where: { subscriberId: sub.id } });

      return NextResponse.json(
        {
          success: true,
          data: {
            items,
            nextCursor,
            total,
            sources: { flows: flowsById, broadcasts: broadcastsById },
          },
        },
        {
          headers: {
            "Cache-Control": "private, max-age=5",
          },
        }
      );
    },
    { roles: ["admin"] }
  );
}
