// Aggregated "lead profile" payload for the chat page sidebar.
// Cheap by design — every query is keyed by (botId, subscriberId) which
// is covered by existing indexes.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-middleware";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params: paramsP }: { params: Promise<{ botId: string; subscriberId: string }> }
) {
  const params = await paramsP;
  return withAuth(
    request,
    async () => {
      const sub = await db.tgSubscriber.findFirst({
        where: { id: params.subscriberId, botId: params.botId },
        select: {
          id: true,
          chatId: true,
          tgUserId: true,
          languageCode: true,
          subscribedAt: true,
          unsubscribedAt: true,
          firstTouchSlug: true,
          firstTouchAt: true,
          lastTouchSlug: true,
          lastTouchAt: true,
        },
      });
      if (!sub) {
        return NextResponse.json(
          { success: false, error: { code: "NOT_FOUND", message: "Subscriber not found" } },
          { status: 404 }
        );
      }

      // Resolve UTM details for the first/last touch slugs if any.
      const slugs = [sub.firstTouchSlug, sub.lastTouchSlug].filter(
        (s): s is string => !!s
      );
      const uniqSlugs = Array.from(new Set(slugs));
      const links = uniqSlugs.length
        ? await db.tgTrackingLink.findMany({
            where: { botId: params.botId, slug: { in: uniqSlugs } },
            select: { slug: true, name: true, utm: true, applyTags: true },
          })
        : [];
      const linkBySlug = new Map(links.map((l) => [l.slug, l]));

      // Aggregate counts. Three small COUNTs — cheap given the
      // tg_messages indices on (subscriberId, createdAt).
      const [messagesIn, messagesOut, buttonClicks] = await Promise.all([
        db.tgMessage.count({
          where: { subscriberId: sub.id, direction: "in" },
        }),
        db.tgMessage.count({
          where: { subscriberId: sub.id, direction: "out" },
        }),
        db.tgMessage.count({
          where: {
            subscriberId: sub.id,
            direction: "in",
            callbackData: { not: null },
          },
        }),
      ]);

      // Completed/cancelled/failed runs (active runs come from the
      // existing subscriber endpoint).
      const flowHistory = await db.tgFlowRun.findMany({
        where: {
          subscriberId: sub.id,
          status: { in: ["completed", "failed", "cancelled"] },
        },
        orderBy: { startedAt: "desc" },
        take: 10,
        select: {
          id: true,
          status: true,
          startedAt: true,
          finishedAt: true,
          currentNodeId: true,
          lastError: true,
          flow: { select: { name: true } },
        },
      });

      // Last broadcasts sent / failed / blocked to this subscriber.
      const broadcasts = await db.tgBroadcastRecipient.findMany({
        where: {
          subscriberId: sub.id,
          status: { in: ["sent", "failed", "blocked"] },
        },
        orderBy: [{ sentAt: "desc" }, { id: "desc" }],
        take: 5,
        select: {
          id: true,
          status: true,
          sentAt: true,
          errorMessage: true,
          broadcast: { select: { id: true, name: true } },
        },
      });

      // Recent raw events. The chat sidebar shows them in a small
      // collapsible feed.
      const events = await db.tgEvent.findMany({
        where: { subscriberId: sub.id },
        orderBy: { occurredAt: "desc" },
        take: 20,
        select: {
          id: true,
          type: true,
          properties: true,
          occurredAt: true,
        },
      });

      const res = NextResponse.json({
        success: true,
        data: {
          identity: {
            chatId: sub.chatId,
            tgUserId: sub.tgUserId,
            languageCode: sub.languageCode,
            subscribedAt: sub.subscribedAt,
            unsubscribedAt: sub.unsubscribedAt,
          },
          touches: {
            first: sub.firstTouchSlug
              ? {
                  slug: sub.firstTouchSlug,
                  at: sub.firstTouchAt,
                  link: linkBySlug.get(sub.firstTouchSlug) ?? null,
                }
              : null,
            last: sub.lastTouchSlug
              ? {
                  slug: sub.lastTouchSlug,
                  at: sub.lastTouchAt,
                  link: linkBySlug.get(sub.lastTouchSlug) ?? null,
                }
              : null,
          },
          stats: {
            messagesIn,
            messagesOut,
            buttonClicks,
          },
          flowHistory,
          broadcasts,
          events,
        },
      });
      res.headers.set("Cache-Control", "private, max-age=15");
      return res;
    },
    { roles: ["admin"] }
  );
}
