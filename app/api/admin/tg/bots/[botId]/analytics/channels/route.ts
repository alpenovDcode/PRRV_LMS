/**
 * /api/admin/tg/bots/[botId]/analytics/channels
 *
 * GET — KPI по каналам за период:
 *   - вступило, вышло, чистый прирост
 *   - сейчас членов (без учёта baseline)
 *   - по каждой инвайт-ссылке: join'ов за период
 *
 * Источник — TgChannelMembership.joinedAt / leftAt в окне.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-middleware";
import { parsePeriod } from "@/lib/tg/analytics/period";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_HEADER = "private, max-age=30, stale-while-revalidate=60";

export async function GET(
  request: NextRequest,
  { params: paramsP }: { params: Promise<{ botId: string }> }
) {
  const params = await paramsP;
  return withAuth(
    request,
    async () => {
      const botId = params.botId;
      const url = new URL(request.url);
      const period = parsePeriod({
        period: url.searchParams.get("period"),
        from: url.searchParams.get("from"),
        to: url.searchParams.get("to"),
      });

      const channels = await db.tgChannel.findMany({
        where: { botId },
        orderBy: { createdAt: "asc" },
      });

      // Join'ы за период по каналу.
      const joins = await db.tgChannelMembership.groupBy({
        by: ["channelId"],
        where: {
          botId,
          joinedAt: { gte: period.from, lte: period.to },
        },
        _count: { _all: true },
      });
      // Leave'ы за период по каналу.
      const leaves = await db.tgChannelMembership.groupBy({
        by: ["channelId"],
        where: {
          botId,
          leftAt: { gte: period.from, lte: period.to },
        },
        _count: { _all: true },
      });
      // Сейчас в канале (статус member-подобный).
      const present = await db.tgChannelMembership.groupBy({
        by: ["channelId"],
        where: {
          botId,
          status: { notIn: ["left", "kicked"] },
        },
        _count: { _all: true },
      });

      const joinMap = new Map(joins.map((r) => [r.channelId, r._count._all]));
      const leaveMap = new Map(leaves.map((r) => [r.channelId, r._count._all]));
      const presentMap = new Map(present.map((r) => [r.channelId, r._count._all]));

      // Join'ы по инвайт-ссылке (атрибуция).
      const byLink = await db.tgChannelMembership.groupBy({
        by: ["channelId", "inviteLinkName"],
        where: {
          botId,
          joinedAt: { gte: period.from, lte: period.to },
          inviteLinkName: { not: null },
        },
        _count: { _all: true },
      });
      const inviteLinks = await db.tgChannelInviteLink.findMany({
        where: { botId },
        select: {
          id: true,
          channelId: true,
          name: true,
          inviteUrl: true,
          utm: true,
          joinCount: true,
          revokedAt: true,
        },
      });
      const linkPeriodMap = new Map<string, number>();
      for (const r of byLink) {
        linkPeriodMap.set(`${r.channelId}::${r.inviteLinkName}`, r._count._all);
      }

      const rows = channels.map((c) => ({
        id: c.id,
        chatId: c.chatId,
        title: c.title,
        username: c.username,
        type: c.type,
        isActive: c.isActive,
        baselineCount: c.baselineCount,
        joinedInPeriod: joinMap.get(c.id) ?? 0,
        leftInPeriod: leaveMap.get(c.id) ?? 0,
        membersTracked: presentMap.get(c.id) ?? 0,
        netInPeriod: (joinMap.get(c.id) ?? 0) - (leaveMap.get(c.id) ?? 0),
        inviteLinks: inviteLinks
          .filter((l) => l.channelId === c.id)
          .map((l) => ({
            id: l.id,
            name: l.name,
            inviteUrl: l.inviteUrl,
            utm: l.utm,
            joinCountTotal: l.joinCount,
            joinsInPeriod: linkPeriodMap.get(`${c.id}::${l.name}`) ?? 0,
            revoked: !!l.revokedAt,
          })),
      }));

      const totals = {
        joinedInPeriod: rows.reduce((a, r) => a + r.joinedInPeriod, 0),
        leftInPeriod: rows.reduce((a, r) => a + r.leftInPeriod, 0),
        netInPeriod: rows.reduce((a, r) => a + r.netInPeriod, 0),
        membersTracked: rows.reduce((a, r) => a + r.membersTracked, 0),
      };

      return NextResponse.json(
        {
          success: true,
          data: {
            rows,
            totals,
            period: {
              from: period.from.toISOString(),
              to: period.to.toISOString(),
              label: period.label,
            },
          },
        },
        { headers: { "Cache-Control": CACHE_HEADER } }
      );
    },
    { roles: ["admin"] }
  );
}
