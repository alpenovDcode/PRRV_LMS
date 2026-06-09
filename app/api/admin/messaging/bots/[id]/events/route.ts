/**
 * app/api/admin/messaging/bots/[id]/events/route.ts
 *
 * Журнал событий MAX/мессенджер-бота для страницы «Логи». Параллель
 * /admin/tg/bots/[botId]/logs.
 *
 * Источник — `MessagingEvent`, в который пишет хелпер `recordEvent` из
 * lib/messaging/events.ts. severity вычисляется через каталог
 * lib/messaging/event-catalog.ts.
 *
 * Фильтры:
 *   severity     — comma-separated (error,warn,info,debug). "all" = всё.
 *   q            — поиск по строке type.
 *   subscriberId — события конкретного подписчика.
 *   since        — ISO timestamp нижней границы.
 *   limit        — 10..200, default 50.
 *   cursor       — id последней записи для bottom-up пагинации.
 *
 * Возвращает:
 *   items        — события с метаданными (severity/label/icon).
 *   nextCursor   — id для следующей страницы, null если конец.
 *   counts24h    — счётчики по severity за последние 24 часа (для чипов).
 *   severities   — каталог чипов с лейблами (для UI).
 */

import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-middleware";
import { UserRole } from "@prisma/client";
import {
  EVENT_CATALOG,
  eventTypesBySeverity,
  getEventMeta,
  SEVERITY_LABEL,
  type EventSeverity,
} from "@/lib/messaging/event-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SEVERITIES: EventSeverity[] = ["error", "warn", "info", "debug"];

export async function GET(
  request: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> }
) {
  const params = await paramsP;
  return withAuth(
    request,
    async () => {
      const url = new URL(request.url);

      // ── parse query ───────────────────────────────────────────────────
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

      const where: Prisma.MessagingEventWhereInput = {
        botId: params.id,
        ...(sevParam !== "all" && {
          type: { in: Array.from(allowedTypes) },
        }),
        ...(subscriberId && { subscriberId }),
        ...(since && { createdAt: { gte: new Date(since) } }),
      };
      if (q) {
        where.type = where.type
          ? { ...(where.type as object), contains: q, mode: "insensitive" }
          : { contains: q, mode: "insensitive" };
      }

      // ── основная выборка ──────────────────────────────────────────────
      // MessagingEvent НЕ имеет relation `subscriber` в Prisma — у TG
      // есть TgEvent.subscriber, у нас нет (модель проще). Поэтому
      // загружаем события без include и догружаем подписчиков одним
      // батчем по id-набору.
      const rows = await db.messagingEvent.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit + 1, // +1 чтобы понять есть ли nextCursor
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });

      const hasMore = rows.length > limit;
      const sliced = hasMore ? rows.slice(0, limit) : rows;

      const subscriberIds = Array.from(
        new Set(
          sliced.map((r) => r.subscriberId).filter((s): s is string => !!s)
        )
      );
      const subscribers = subscriberIds.length
        ? await db.messagingSubscriber.findMany({
            where: { id: { in: subscriberIds } },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              username: true,
              externalUserId: true,
            },
          })
        : [];
      const subscribersById = new Map(subscribers.map((s) => [s.id, s]));

      const items = sliced.map((r) => {
        const meta = getEventMeta(r.type);
        const sub = r.subscriberId ? subscribersById.get(r.subscriberId) : null;
        return {
          id: r.id,
          type: r.type,
          severity: meta.severity,
          label: meta.label,
          icon: meta.icon,
          description: meta.description,
          data: r.data,
          subscriberId: r.subscriberId,
          subscriber: sub
            ? {
                id: sub.id,
                name:
                  [sub.firstName, sub.lastName].filter(Boolean).join(" ") ||
                  sub.username ||
                  sub.externalUserId,
              }
            : null,
          occurredAt: r.createdAt.toISOString(),
        };
      });
      const nextCursor = hasMore ? items[items.length - 1].id : null;

      // ── счётчики за 24 часа ──────────────────────────────────────────
      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const last24h = await db.messagingEvent.findMany({
        where: { botId: params.id, createdAt: { gte: since24h } },
        select: { type: true },
        take: 50_000, // защита; обычно сильно меньше
      });
      const counts24h: Record<EventSeverity, number> = {
        error: 0,
        warn: 0,
        info: 0,
        debug: 0,
      };
      for (const e of last24h) {
        const m = getEventMeta(e.type);
        counts24h[m.severity]++;
      }

      const severities = SEVERITIES.map((s) => ({
        key: s,
        label: SEVERITY_LABEL[s],
        count24h: counts24h[s],
      }));

      return NextResponse.json({
        success: true,
        data: {
          items,
          nextCursor,
          counts24h,
          severities,
          catalogSize: Object.keys(EVENT_CATALOG).length,
        },
      });
    },
    { roles: [UserRole.admin] }
  );
}
