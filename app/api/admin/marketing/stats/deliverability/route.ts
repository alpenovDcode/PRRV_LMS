import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";

/**
 * GET /api/admin/marketing/stats/deliverability
 *
 * Метрики маркетинговых рассылок за период (по умолчанию 30 дней).
 *
 * Query:
 *   days — окно в днях (1..365), default 30
 *
 * Возвращает агрегаты по EmailEvent.type:
 *   - sent / delivered / opened / clicked / bounced / spam / unsubscribed
 *   - weeklyOR (по неделям) — для графика
 *   - topCampaigns — 5 кампаний с наибольшим OR за период
 *
 * Метрики берём из EmailEvent count, чтобы не зависеть от stats.json
 * в EmailCampaign (он не всегда обновлён в реальном времени).
 */
export async function GET(request: NextRequest) {
  return withAuth(
    request,
    async () => {
      const { searchParams } = new URL(request.url);
      const days = Math.max(1, Math.min(365, Number(searchParams.get("days") ?? "30")));

      const now = new Date();
      const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

      // Базовые агрегаты типов.
      const [sent, delivered, opened, clicked, bounced, spam, unsubscribed] = await Promise.all([
        db.emailEvent.count({ where: { type: "sent", occurredAt: { gte: since } } }),
        db.emailEvent.count({ where: { type: "delivered", occurredAt: { gte: since } } }),
        db.emailEvent.count({ where: { type: "opened", occurredAt: { gte: since } } }),
        db.emailEvent.count({ where: { type: "clicked", occurredAt: { gte: since } } }),
        db.emailEvent.count({ where: { type: "bounced", occurredAt: { gte: since } } }),
        db.emailEvent.count({ where: { type: "spam", occurredAt: { gte: since } } }),
        db.emailEvent.count({ where: { type: "unsubscribed", occurredAt: { gte: since } } }),
      ]);

      // Уникальные открытия по userId — для honest OR.
      const uniqueOpenedRaw = await db.emailEvent.findMany({
        where: { type: "opened", occurredAt: { gte: since }, userId: { not: null } },
        distinct: ["userId"],
        select: { userId: true },
      });
      const uniqueClickedRaw = await db.emailEvent.findMany({
        where: { type: "clicked", occurredAt: { gte: since }, userId: { not: null } },
        distinct: ["userId"],
        select: { userId: true },
      });

      const openRate = sent > 0 ? uniqueOpenedRaw.length / sent : 0;
      const clickRate = sent > 0 ? uniqueClickedRaw.length / sent : 0;
      const bounceRate = sent > 0 ? bounced / sent : 0;
      const unsubRate = sent > 0 ? unsubscribed / sent : 0;
      const spamRate = sent > 0 ? spam / sent : 0;

      // Weekly buckets для графика — берём по 7 точек (одна на неделю последнего N).
      const buckets = Math.min(12, Math.ceil(days / 7));
      const weekly: Array<{ weekStart: string; sent: number; opened: number; clicked: number }> = [];
      for (let i = buckets - 1; i >= 0; i--) {
        const weekEnd = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
        const weekStart = new Date(weekEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
        const [s, o, c] = await Promise.all([
          db.emailEvent.count({ where: { type: "sent", occurredAt: { gte: weekStart, lt: weekEnd } } }),
          db.emailEvent.count({ where: { type: "opened", occurredAt: { gte: weekStart, lt: weekEnd } } }),
          db.emailEvent.count({ where: { type: "clicked", occurredAt: { gte: weekStart, lt: weekEnd } } }),
        ]);
        weekly.push({ weekStart: weekStart.toISOString().slice(0, 10), sent: s, opened: o, clicked: c });
      }

      // Топ кампаний по OR за период. Сначала найдём кампании с активностью,
      // потом для каждой посчитаем количества.
      const recentCampaigns = await db.emailCampaign.findMany({
        where: { startedAt: { gte: since, not: null } },
        select: { id: true, name: true, subject: true, stats: true, finishedAt: true },
        orderBy: { startedAt: "desc" },
        take: 50,
      });

      const topCampaigns = recentCampaigns
        .map((c) => {
          const stats = (c.stats as Record<string, number> | null) ?? {};
          const cSent = stats.sent ?? 0;
          const cOpened = stats.opened ?? 0;
          const cClicked = stats.clicked ?? 0;
          return {
            id: c.id,
            name: c.name,
            subject: c.subject,
            finishedAt: c.finishedAt,
            sent: cSent,
            opened: cOpened,
            clicked: cClicked,
            openRate: cSent > 0 ? cOpened / cSent : 0,
            clickRate: cSent > 0 ? cClicked / cSent : 0,
          };
        })
        .filter((c) => c.sent > 0)
        .sort((a, b) => b.openRate - a.openRate)
        .slice(0, 5);

      return NextResponse.json<ApiResponse>({
        success: true,
        data: {
          period: { days, since: since.toISOString(), until: now.toISOString() },
          totals: { sent, delivered, opened, clicked, bounced, spam, unsubscribed },
          uniques: { opened: uniqueOpenedRaw.length, clicked: uniqueClickedRaw.length },
          rates: { openRate, clickRate, bounceRate, unsubRate, spamRate },
          weekly,
          topCampaigns,
        },
      });
    },
    { roles: [UserRole.admin] }
  );
}
