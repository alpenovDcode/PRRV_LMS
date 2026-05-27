import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { UserRole } from "@prisma/client";

/**
 * GET /api/admin/messaging/bots/[id]/analytics?days=7
 *
 * Базовая аналитика по событиям MessagingEvent:
 *   • totals: subscribers, flows (active), broadcasts (sent today)
 *   • messages: in/out за период
 *   • events: разбивка по type
 *   • topTriggers: самые срабатывающие
 *   • timeline: события по дням
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    req,
    async () => {
      const { id } = await params;
      const url = new URL(req.url);
      const days = Math.min(90, Math.max(1, Number(url.searchParams.get("days") ?? 7)));
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      // ── Totals
      const [subscribersTotal, subscribersNew, activeFlows, broadcastsToday] = await Promise.all([
        db.messagingSubscriber.count({ where: { botId: id } }),
        db.messagingSubscriber.count({
          where: { botId: id, subscribedAt: { gte: since } },
        }),
        db.messagingFlow.count({ where: { botId: id, isActive: true } }),
        db.messagingBroadcast.count({
          where: { botId: id, completedAt: { gte: todayStart } },
        }),
      ]);

      // ── Сообщения in/out за период
      const messages = await db.messagingMessage.groupBy({
        by: ["direction"],
        where: { botId: id, createdAt: { gte: since } },
        _count: true,
      });
      const messagesIn = messages.find((m) => m.direction === "in")?._count ?? 0;
      const messagesOut = messages.find((m) => m.direction === "out")?._count ?? 0;

      // ── Разбивка по типам событий
      const eventsByType = await db.messagingEvent.groupBy({
        by: ["type"],
        where: { botId: id, createdAt: { gte: since } },
        _count: true,
        orderBy: { _count: { type: "desc" } },
      });

      // ── Топ триггеров
      const topTriggers = await db.messagingTrigger.findMany({
        where: { flow: { botId: id } },
        orderBy: { triggerCount: "desc" },
        take: 10,
        select: {
          id: true,
          type: true,
          keywords: true,
          triggerCount: true,
          lastTriggeredAt: true,
          flow: { select: { id: true, name: true } },
        },
      });

      // ── Timeline: события по дням (last N days)
      const rawTimeline = await db.$queryRaw<{ day: Date; count: bigint }[]>`
        SELECT DATE_TRUNC('day', "createdAt") AS day, COUNT(*)::bigint AS count
        FROM "MessagingEvent"
        WHERE "botId" = ${id} AND "createdAt" >= ${since}
        GROUP BY day
        ORDER BY day ASC
      `;
      const timeline = rawTimeline.map((r) => ({
        day: r.day,
        count: Number(r.count),
      }));

      // ── Топ воронок по запускам за период.
      // groupBy на JSON-поле не работает (json равен только если идентичен),
      // поэтому считаем вручную через findMany.
      const flowEvents = await db.messagingEvent.findMany({
        where: { botId: id, type: "flow.started", createdAt: { gte: since } },
        select: { data: true },
      });
      const flowCountMap = new Map<string, number>();
      for (const e of flowEvents) {
        const flowId = (e.data as any)?.flowId;
        if (typeof flowId === "string") {
          flowCountMap.set(flowId, (flowCountMap.get(flowId) ?? 0) + 1);
        }
      }
      const flowIds = Array.from(flowCountMap.keys());
      const flowDetails =
        flowIds.length > 0
          ? await db.messagingFlow.findMany({
              where: { id: { in: flowIds } },
              select: { id: true, name: true },
            })
          : [];
      const topFlows = flowDetails
        .map((f) => ({ ...f, starts: flowCountMap.get(f.id) ?? 0 }))
        .sort((a, b) => b.starts - a.starts)
        .slice(0, 10);

      return NextResponse.json({
        success: true,
        data: {
          period: { days, since },
          totals: {
            subscribersTotal,
            subscribersNew,
            activeFlows,
            broadcastsToday,
            messagesIn,
            messagesOut,
          },
          eventsByType: eventsByType.map((e) => ({
            type: e.type,
            count: e._count,
          })),
          topTriggers,
          topFlows,
          timeline,
        },
      });
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}
