/**
 * CSV-выгрузка подписчиков, которые кликнули по ссылке из рассылки
 * (в окне атрибуции). Один подписчик — одна строка; в колонке
 * `clicks` агрегат, в `first_click_at` — самый ранний клик после
 * отправки рассылки, в `targets` — список целевых URL через `,`.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-middleware";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ATTRIBUTION_WINDOW_DAYS = 14;

const COLUMNS = [
  "chat_id",
  "username",
  "first_name",
  "last_name",
  "first_click_at",
  "clicks",
  "targets",
  "sent_at",
  "first_touch_slug",
  "last_touch_slug",
];

export async function GET(
  req: NextRequest,
  {
    params: paramsP,
  }: { params: Promise<{ botId: string; broadcastId: string }> }
) {
  const params = await paramsP;
  return withAuth(
    req,
    async () => {
      const broadcast = await db.tgBroadcast.findFirst({
        where: { id: params.broadcastId, botId: params.botId },
      });
      if (!broadcast) {
        return NextResponse.json(
          { success: false, error: "Broadcast not found" },
          { status: 404 }
        );
      }

      const sent = await db.tgBroadcastRecipient.findMany({
        where: { broadcastId: broadcast.id, status: "sent" },
        select: { subscriberId: true, sentAt: true },
      });
      const sentBySub = new Map<string, Date>();
      for (const r of sent) {
        if (r.sentAt) sentBySub.set(r.subscriberId, r.sentAt);
      }
      const subIds = Array.from(sentBySub.keys());
      if (subIds.length === 0) {
        return csv([COLUMNS.join(";")], broadcast.name);
      }

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
      const agg = new Map<
        string,
        { firstAt: Date; count: number; targets: Set<string> }
      >();
      for (const ev of events) {
        if (!ev.subscriberId) continue;
        const sentAt = sentBySub.get(ev.subscriberId);
        if (!sentAt) continue;
        const delta = ev.occurredAt.getTime() - sentAt.getTime();
        if (delta < 0 || delta > windowMs) continue;
        const cur = agg.get(ev.subscriberId) ?? {
          firstAt: ev.occurredAt,
          count: 0,
          targets: new Set<string>(),
        };
        cur.count++;
        if (ev.occurredAt < cur.firstAt) cur.firstAt = ev.occurredAt;
        const target = (ev.properties as { target?: unknown })?.target;
        if (typeof target === "string") cur.targets.add(target);
        agg.set(ev.subscriberId, cur);
      }

      const clickerIds = Array.from(agg.keys());
      const subs = await db.tgSubscriber.findMany({
        where: { id: { in: clickerIds } },
        select: {
          id: true,
          chatId: true,
          username: true,
          firstName: true,
          lastName: true,
          firstTouchSlug: true,
          lastTouchSlug: true,
        },
      });

      const rows: string[] = ["﻿" + COLUMNS.map(csvEscape).join(";")];
      for (const s of subs) {
        const a = agg.get(s.id)!;
        const sentAt = sentBySub.get(s.id);
        rows.push(
          [
            s.chatId,
            s.username ?? "",
            s.firstName ?? "",
            s.lastName ?? "",
            a.firstAt.toISOString(),
            String(a.count),
            Array.from(a.targets).join(","),
            sentAt ? sentAt.toISOString() : "",
            s.firstTouchSlug ?? "",
            s.lastTouchSlug ?? "",
          ]
            .map(csvEscape)
            .join(";")
        );
      }

      return csv(rows, broadcast.name);
    },
    { roles: ["admin"] }
  );
}

function csv(rows: string[], broadcastName: string): NextResponse {
  const body = rows.join("\r\n");
  const date = new Date().toISOString().slice(0, 10);
  const safeName = broadcastName.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 40);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="clickers_${safeName}_${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

function csvEscape(value: string): string {
  const needsQuote =
    value.includes(";") ||
    value.includes('"') ||
    value.includes("\n") ||
    value.includes("\r") ||
    /^0\d/.test(value);
  if (!needsQuote) return value;
  return `"${value.replace(/"/g, '""')}"`;
}
