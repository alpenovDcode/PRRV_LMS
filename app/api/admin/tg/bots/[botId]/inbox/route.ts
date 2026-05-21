import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-middleware";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Inbox для оператора: списки диалогов, требующих внимания.
//   • active     — текущие takeover’ы (operatorTakeoverAt < 24ч)
//   • waiting    — подписчики с inbound, отправленным за последние 24ч,
//                  где не было нашего outbound с того момента (висит без ответа)
//   • recent     — недавно активные (по lastSeenAt) — общий fallback
//
// Возвращаем минимум полей для списка; deep-dive — в /subscribers/<id>.
export async function GET(
  request: NextRequest,
  { params: paramsP }: { params: Promise<{ botId: string }> }
) {
  const params = await paramsP;
  return withAuth(
    request,
    async () => {
      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

      // 1) Active operator takeovers
      const active = await db.tgSubscriber.findMany({
        where: {
          botId: params.botId,
          operatorTakeoverAt: { gte: since24h },
        },
        orderBy: { operatorTakeoverAt: "desc" },
        take: 50,
        select: {
          id: true,
          chatId: true,
          firstName: true,
          lastName: true,
          username: true,
          tags: true,
          operatorTakeoverAt: true,
          operatorAssigneeId: true,
          lastSeenAt: true,
        },
      });

      // 2) Waiting — inbound за 24ч, и наш последний outbound старше inbound’а
      //    (или его не было). Sql быстрее всего.
      const waitingRaw = await db.$queryRaw<
        Array<{
          subscriber_id: string;
          last_inbound: Date;
          last_outbound: Date | null;
        }>
      >`
        SELECT
          s.id AS subscriber_id,
          MAX(m_in.created_at) AS last_inbound,
          (
            SELECT MAX(created_at) FROM tg_messages
            WHERE subscriber_id = s.id AND direction = 'out'
          ) AS last_outbound
        FROM tg_subscribers s
        JOIN tg_messages m_in
          ON m_in.subscriber_id = s.id
         AND m_in.direction = 'in'
        WHERE s.bot_id = ${params.botId}
          AND s.is_blocked = false
          AND s.operator_takeover_at IS NULL
          AND m_in.created_at >= ${since24h}
        GROUP BY s.id
        HAVING MAX(m_in.created_at) > COALESCE(
          (SELECT MAX(created_at) FROM tg_messages
           WHERE subscriber_id = s.id AND direction = 'out'),
          'epoch'::timestamp
        )
        ORDER BY last_inbound DESC
        LIMIT 100
      `;

      const waitingIds = waitingRaw.map((r) => r.subscriber_id);
      const waitingDetail =
        waitingIds.length > 0
          ? await db.tgSubscriber.findMany({
              where: { id: { in: waitingIds } },
              select: {
                id: true,
                chatId: true,
                firstName: true,
                lastName: true,
                username: true,
                tags: true,
                lastSeenAt: true,
              },
            })
          : [];
      const waitingMap = new Map(waitingDetail.map((d) => [d.id, d]));
      const waiting = waitingRaw
        .map((r) => {
          const det = waitingMap.get(r.subscriber_id);
          if (!det) return null;
          return {
            ...det,
            lastInbound: r.last_inbound.toISOString(),
            lastOutbound: r.last_outbound?.toISOString() ?? null,
          };
        })
        .filter(Boolean);

      // 3) Recent — fallback: последние 20 виденных
      const recent = await db.tgSubscriber.findMany({
        where: {
          botId: params.botId,
          isBlocked: false,
          lastSeenAt: { gte: since24h },
        },
        orderBy: { lastSeenAt: "desc" },
        take: 20,
        select: {
          id: true,
          chatId: true,
          firstName: true,
          lastName: true,
          username: true,
          tags: true,
          lastSeenAt: true,
          operatorTakeoverAt: true,
        },
      });

      return NextResponse.json({
        success: true,
        data: {
          active: active.map((a) => ({
            ...a,
            operatorTakeoverAt: a.operatorTakeoverAt?.toISOString() ?? null,
            lastSeenAt: a.lastSeenAt?.toISOString() ?? null,
          })),
          waiting,
          recent: recent.map((r) => ({
            ...r,
            operatorTakeoverAt: r.operatorTakeoverAt?.toISOString() ?? null,
            lastSeenAt: r.lastSeenAt?.toISOString() ?? null,
          })),
        },
      });
    },
    { roles: ["admin"] }
  );
}
