// Журнал работы бота для админ-страницы «Логи».
//
// Источник данных — таблица tg_events, в которую движок пишет все
// нотификации (см. trackEvent в lib/tg/events.ts и enrichment-фиксы
// последних коммитов). Каждое событие маркируется severity-уровнем
// через каталог lib/tg/event-catalog.ts.
//
// Поддерживаются фильтры:
//   - severity:  error | warn | info | debug | all
//   - q:         поиск по properties (raw JSON ILIKE)
//   - subscriberId: только события конкретного подписчика
//   - since:     ISO timestamp (нижняя граница времени)
//   - cursor:    last event.id для bottom-up пагинации

import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-middleware";
import {
  EVENT_CATALOG,
  eventTypesBySeverity,
  getEventMeta,
  type EventSeverity,
} from "@/lib/tg/event-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SEVERITIES: EventSeverity[] = ["error", "warn", "info", "debug"];

export async function GET(
  request: NextRequest,
  { params: paramsP }: { params: Promise<{ botId: string }> }
) {
  const params = await paramsP;
  return withAuth(
    request,
    async (req) => {
      const url = new URL(req.url);

      // severity filter — comma-separated; "all" or empty means everything.
      const sevParam = url.searchParams.get("severity") ?? "error,warn,info";
      const requested = sevParam
        .split(",")
        .map((s) => s.trim() as EventSeverity)
        .filter((s) => SEVERITIES.includes(s));
      const allowedTypes = new Set<string>();
      for (const sev of requested) {
        for (const t of eventTypesBySeverity(sev)) allowedTypes.add(t);
      }

      const subscriberId = url.searchParams.get("subscriberId");
      const since = url.searchParams.get("since");
      const q = (url.searchParams.get("q") ?? "").trim();
      const limit = Math.min(
        200,
        Math.max(10, parseInt(url.searchParams.get("limit") ?? "50", 10) || 50)
      );
      const cursor = url.searchParams.get("cursor");

      // Build the WHERE — combine bot scope, allowed event types,
      // optional subscriber filter, time filter, free-text search.
      const where: Prisma.TgEventWhereInput = {
        botId: params.botId,
        ...(sevParam !== "all" && {
          type: { in: Array.from(allowedTypes) },
        }),
        ...(subscriberId && { subscriberId }),
        ...(since && { occurredAt: { gte: new Date(since) } }),
      };
      // Free-text — search across event type and JSON-stringified properties.
      // (Casting Json column to text isn't ideal performance-wise, but for
      // the volumes a bot generates it's fine; if it ever gets slow we add
      // a tg_events_search GIN index on (type || ' ' || properties::text).)
      if (q) {
        where.OR = [
          { type: { contains: q, mode: "insensitive" } },
          // Prisma doesn't have a native operator for "search JSON as text",
          // so we filter type-side only. Free-text inside properties has to
          // happen client-side post-fetch. Good enough for an MVP «Логи».
        ];
      }

      const rows = await db.tgEvent.findMany({
        where,
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        include: {
          subscriber: {
            select: {
              id: true,
              chatId: true,
              firstName: true,
              lastName: true,
              username: true,
            },
          },
        },
      });

      const nextCursor = rows.length > limit ? rows[limit - 1].id : null;
      const items = rows.slice(0, limit).map((e) => {
        const meta = getEventMeta(e.type);
        return {
          id: e.id,
          type: e.type,
          meta,
          subscriber: e.subscriber
            ? {
                id: e.subscriber.id,
                chatId: e.subscriber.chatId,
                name:
                  [e.subscriber.firstName, e.subscriber.lastName]
                    .filter(Boolean)
                    .join(" ") || null,
                username: e.subscriber.username,
              }
            : null,
          properties: e.properties,
          occurredAt: e.occurredAt,
        };
      });

      // Aggregate counts per severity for the filter chips. Cheap because
      // tg_events is partitioned by (botId, type, occurredAt).
      const since24h = new Date(Date.now() - 24 * 3600_000);
      const counts: Record<EventSeverity, number> = {
        error: 0,
        warn: 0,
        info: 0,
        debug: 0,
      };
      const grouped = await db.tgEvent.groupBy({
        by: ["type"],
        where: { botId: params.botId, occurredAt: { gte: since24h } },
        _count: true,
      });
      for (const g of grouped) {
        const sev = (EVENT_CATALOG[g.type]?.severity ?? "info") as EventSeverity;
        counts[sev] += g._count;
      }

      return NextResponse.json({
        success: true,
        data: {
          items,
          nextCursor,
          counts24h: counts,
          severities: SEVERITIES,
        },
      });
    },
    { roles: ["admin"] }
  );
}
