// Полное «досье» лида для карточки в мессенджере: журнал воронок,
// таймлайн событий, A/B-эксперименты, клики, история тегов, UTM,
// конверсия. Один endpoint — фронт раскладывает events по категориям.
//
// Все запросы keyed по (botId, subscriberId) — покрыто индексами
// tg_events(subscriber_id, occurred_at), tg_flow_runs(subscriber_id,...).

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-middleware";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Сколько последних событий тянем в таймлайн. 300 — с запасом на
// активного лида за несколько месяцев; индекс делает запрос дешёвым.
const EVENTS_LIMIT = 300;

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
          isBlocked: true,
          subscribedAt: true,
          unsubscribedAt: true,
          firstTouchSlug: true,
          firstTouchAt: true,
          lastTouchSlug: true,
          lastTouchAt: true,
          customFields: true,
          currentPositionFlowId: true,
          currentPositionNodeId: true,
          currentPositionAt: true,
        },
      });
      if (!sub) {
        return NextResponse.json(
          { success: false, error: { code: "NOT_FOUND", message: "Subscriber not found" } },
          { status: 404 }
        );
      }

      // -- Журнал воронок: ВСЕ runs лида, не только завершённые ----------
      const flowRuns = await db.tgFlowRun.findMany({
        where: { subscriberId: sub.id },
        orderBy: { startedAt: "desc" },
        take: 100,
        select: {
          id: true,
          flowId: true,
          status: true,
          currentNodeId: true,
          startedAt: true,
          finishedAt: true,
          lastError: true,
          flow: { select: { name: true } },
        },
      });

      // -- Таймлайн событий ---------------------------------------------
      const events = await db.tgEvent.findMany({
        where: { subscriberId: sub.id },
        orderBy: { occurredAt: "desc" },
        take: EVENTS_LIMIT,
        select: {
          id: true,
          type: true,
          properties: true,
          occurredAt: true,
        },
      });

      // -- Рассылки -----------------------------------------------------
      const broadcasts = await db.tgBroadcastRecipient.findMany({
        where: { subscriberId: sub.id },
        orderBy: [{ sentAt: "desc" }, { id: "desc" }],
        take: 30,
        select: {
          id: true,
          status: true,
          sentAt: true,
          errorMessage: true,
          broadcast: { select: { id: true, name: true } },
        },
      });

      // -- Счётчики сообщений -------------------------------------------
      const [messagesIn, messagesOut, buttonClicks] = await Promise.all([
        db.tgMessage.count({ where: { subscriberId: sub.id, direction: "in" } }),
        db.tgMessage.count({ where: { subscriberId: sub.id, direction: "out" } }),
        db.tgMessage.count({
          where: {
            subscriberId: sub.id,
            direction: "in",
            callbackData: { not: null },
          },
        }),
      ]);

      // -- Текущая позиция в воронке + имя флоу -------------------------
      let position: {
        flowId: string;
        flowName: string;
        nodeId: string | null;
        at: string | null;
      } | null = null;
      if (sub.currentPositionFlowId) {
        const posFlow = await db.tgFlow.findUnique({
          where: { id: sub.currentPositionFlowId },
          select: { name: true },
        });
        position = {
          flowId: sub.currentPositionFlowId,
          flowName: posFlow?.name ?? "(удалённый сценарий)",
          nodeId: sub.currentPositionNodeId,
          at: sub.currentPositionAt?.toISOString() ?? null,
        };
      }

      // -- UTM-атрибуция: резолвим slug → tracking link ------------------
      const slugs = Array.from(
        new Set(
          [sub.firstTouchSlug, sub.lastTouchSlug].filter(
            (s): s is string => !!s
          )
        )
      );
      const links = slugs.length
        ? await db.tgTrackingLink.findMany({
            where: { botId: params.botId, slug: { in: slugs } },
            select: { slug: true, name: true, utm: true },
          })
        : [];
      const linkBySlug = new Map(links.map((l) => [l.slug, l]));

      // -- Конверсия лида: started / completed по журналу ---------------
      const started = flowRuns.length;
      const completed = flowRuns.filter((r) => r.status === "completed").length;
      const failed = flowRuns.filter((r) => r.status === "failed").length;
      const cancelled = flowRuns.filter(
        (r) => r.status === "cancelled"
      ).length;
      const conversionRate =
        started > 0 ? Math.round((completed / started) * 1000) / 10 : 0;

      return NextResponse.json(
        {
          success: true,
          data: {
            identity: {
              chatId: sub.chatId,
              tgUserId: sub.tgUserId,
              languageCode: sub.languageCode,
              isBlocked: sub.isBlocked,
              subscribedAt: sub.subscribedAt.toISOString(),
              unsubscribedAt: sub.unsubscribedAt?.toISOString() ?? null,
            },
            customFields: (sub.customFields ?? {}) as Record<string, unknown>,
            position,
            conversion: {
              started,
              completed,
              failed,
              cancelled,
              conversionRate,
            },
            flowRuns: flowRuns.map((r) => ({
              id: r.id,
              flowId: r.flowId,
              flowName: r.flow?.name ?? "(удалённый сценарий)",
              status: r.status,
              currentNodeId: r.currentNodeId,
              startedAt: r.startedAt.toISOString(),
              finishedAt: r.finishedAt?.toISOString() ?? null,
              durationSec: r.finishedAt
                ? Math.round(
                    (r.finishedAt.getTime() - r.startedAt.getTime()) / 1000
                  )
                : null,
              lastError: r.lastError,
            })),
            events: events.map((e) => ({
              id: e.id,
              type: e.type,
              properties: e.properties,
              occurredAt: e.occurredAt.toISOString(),
            })),
            broadcasts: broadcasts.map((b) => ({
              id: b.id,
              status: b.status,
              sentAt: b.sentAt?.toISOString() ?? null,
              errorMessage: b.errorMessage,
              broadcastId: b.broadcast.id,
              broadcastName: b.broadcast.name,
            })),
            stats: { messagesIn, messagesOut, buttonClicks },
            touches: {
              first: sub.firstTouchSlug
                ? {
                    slug: sub.firstTouchSlug,
                    at: sub.firstTouchAt?.toISOString() ?? null,
                    link: linkBySlug.get(sub.firstTouchSlug) ?? null,
                  }
                : null,
              last: sub.lastTouchSlug
                ? {
                    slug: sub.lastTouchSlug,
                    at: sub.lastTouchAt?.toISOString() ?? null,
                    link: linkBySlug.get(sub.lastTouchSlug) ?? null,
                  }
                : null,
            },
          },
        },
        { headers: { "Cache-Control": "private, max-age=15" } }
      );
    },
    { roles: ["admin"] }
  );
}
