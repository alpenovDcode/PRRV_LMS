/**
 * /api/admin/tg/bots/[botId]/broadcasts/[broadcastId]/report
 *
 * GET — отчёт по конкретной рассылке: агрегаты по статусам получателей,
 *       клики по trackingLinks (атрибуция по окну после отправки), топ
 *       целевых URL.
 *
 * Атрибуция кликов:
 * Поскольку в TgRedirectLink нет sourceBroadcastId (специально не плодим
 * миграцию), клики мэтчим по времени: подписчик из получателей с
 * status=sent + событие redirect.clicked с occurredAt в окне
 * [sentAt, sentAt + 14d]. 14 дней — щедрое окно, накрывает CTA, которые
 * юзер не открыл сразу.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-middleware";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ATTRIBUTION_WINDOW_DAYS = 14;

export async function GET(
  request: NextRequest,
  {
    params: paramsP,
  }: { params: Promise<{ botId: string; broadcastId: string }> }
) {
  const params = await paramsP;
  return withAuth(
    request,
    async () => {
      const broadcast = await db.tgBroadcast.findFirst({
        where: { id: params.broadcastId, botId: params.botId },
      });
      if (!broadcast) {
        return NextResponse.json(
          { success: false, error: { code: "NOT_FOUND", message: "Рассылка не найдена" } },
          { status: 404 }
        );
      }

      // 1) Агрегаты по статусам получателей.
      const statusGroups = await db.tgBroadcastRecipient.groupBy({
        by: ["status"],
        where: { broadcastId: broadcast.id },
        _count: { _all: true },
      });
      const counts = {
        total: 0,
        pending: 0,
        sent: 0,
        failed: 0,
        blocked: 0,
        skipped: 0,
      } as Record<string, number>;
      for (const g of statusGroups) {
        counts[g.status] = g._count._all;
        counts.total += g._count._all;
      }

      // 2) Получатели со статусом sent — для атрибуции кликов нужно их
      // subscriberId и sentAt (момент доставки → старт окна).
      const sentRecipients = await db.tgBroadcastRecipient.findMany({
        where: { broadcastId: broadcast.id, status: "sent" },
        select: { subscriberId: true, sentAt: true },
      });
      const sentBySub = new Map<string, Date>();
      for (const r of sentRecipients) {
        if (r.sentAt) sentBySub.set(r.subscriberId, r.sentAt);
      }

      // 3) Клики по trackingLinks в окне после отправки. Берём только
      // подписчиков из этой рассылки + смотрим redirect.clicked-события.
      const subIds = Array.from(sentBySub.keys());
      let uniqueClickers = 0;
      let totalClicks = 0;
      const clicksByTarget = new Map<string, { clicks: number; clickers: Set<string> }>();
      const clickedSubs = new Map<string, { firstAt: Date; count: number }>();

      if (subIds.length > 0) {
        const events = await db.tgEvent.findMany({
          where: {
            botId: params.botId,
            subscriberId: { in: subIds },
            type: "redirect.clicked",
          },
          select: {
            subscriberId: true,
            properties: true,
            occurredAt: true,
          },
        });
        const windowMs = ATTRIBUTION_WINDOW_DAYS * 24 * 3600 * 1000;
        for (const ev of events) {
          if (!ev.subscriberId) continue;
          const sentAt = sentBySub.get(ev.subscriberId);
          if (!sentAt) continue;
          const delta = ev.occurredAt.getTime() - sentAt.getTime();
          if (delta < 0 || delta > windowMs) continue; // вне окна атрибуции
          totalClicks++;
          const target =
            (ev.properties as { target?: unknown })?.target;
          const key = typeof target === "string" ? target : "(unknown)";
          const cur = clicksByTarget.get(key) ?? {
            clicks: 0,
            clickers: new Set<string>(),
          };
          cur.clicks++;
          cur.clickers.add(ev.subscriberId);
          clicksByTarget.set(key, cur);
          const sub = clickedSubs.get(ev.subscriberId) ?? {
            firstAt: ev.occurredAt,
            count: 0,
          };
          sub.count++;
          if (ev.occurredAt < sub.firstAt) sub.firstAt = ev.occurredAt;
          clickedSubs.set(ev.subscriberId, sub);
        }
        uniqueClickers = clickedSubs.size;
      }

      const targetsBreakdown = Array.from(clicksByTarget.entries())
        .map(([target, v]) => ({
          target,
          clicks: v.clicks,
          uniqueClickers: v.clickers.size,
        }))
        .sort((a, b) => b.clicks - a.clicks);

      // 4) Конверсии — отношения для KPI.
      const ctr = counts.sent > 0 ? uniqueClickers / counts.sent : 0;

      return NextResponse.json({
        success: true,
        data: {
          broadcast,
          counts: {
            total: counts.total,
            pending: counts.pending,
            sent: counts.sent,
            failed: counts.failed,
            blocked: counts.blocked,
            skipped: counts.skipped,
          },
          clicks: {
            uniqueClickers,
            totalClicks,
            ctr, // подписчики, которые кликнули / sent
          },
          targets: targetsBreakdown,
          attributionWindowDays: ATTRIBUTION_WINDOW_DAYS,
        },
      });
    },
    { roles: ["admin"] }
  );
}
