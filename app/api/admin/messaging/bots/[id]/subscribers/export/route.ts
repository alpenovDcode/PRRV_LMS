/**
 * app/api/admin/messaging/bots/[id]/subscribers/export/route.ts
 *
 * Скачивание базы подписчиков MAX/мессенджер-бота в CSV. Аналог
 * /admin/tg/bots/[id]/subscribers/export. Без пагинации — для среднего
 * бота на 50k подписчиков это потянет (~10 MB CSV). Большие базы лучше
 * грузить чанками — оставим на отдельный этап.
 *
 * Возвращает CSV с BOM (Excel-friendly), Content-Disposition: attachment.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-middleware";
import { UserRole } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(
  request: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> }
) {
  const params = await paramsP;
  return withAuth(
    request,
    async () => {
      const bot = await db.messagingBot.findUnique({
        where: { id: params.id },
        select: { id: true, title: true, externalAccountId: true },
      });
      if (!bot) {
        return NextResponse.json(
          { success: false, error: "Бот не найден" },
          { status: 404 }
        );
      }

      // Соберём подписчиков с минимально нужными полями. Variables не
      // включаем — это сырой JSON, который ломает плоский CSV.
      const subs = await db.messagingSubscriber.findMany({
        where: { botId: params.id },
        orderBy: { subscribedAt: "asc" },
        select: {
          externalUserId: true,
          firstName: true,
          lastName: true,
          username: true,
          tags: true,
          subscribedAt: true,
          lastInboundAt: true,
          lastSeenAt: true,
          operatorTakeoverAt: true,
          lmsUser: { select: { email: true, fullName: true } },
        },
      });

      const headers = [
        "externalUserId",
        "firstName",
        "lastName",
        "username",
        "tags",
        "subscribedAt",
        "lastInboundAt",
        "lastSeenAt",
        "lmsEmail",
        "lmsFullName",
        "operatorTakeoverAt",
      ];
      const lines = [headers.join(",")];
      for (const s of subs) {
        lines.push(
          [
            csvEscape(s.externalUserId),
            csvEscape(s.firstName ?? ""),
            csvEscape(s.lastName ?? ""),
            csvEscape(s.username ?? ""),
            csvEscape(s.tags.join("|")), // pipe-separated чтобы не путать с CSV-запятой
            csvEscape(s.subscribedAt.toISOString()),
            csvEscape(s.lastInboundAt?.toISOString() ?? ""),
            csvEscape(s.lastSeenAt?.toISOString() ?? ""),
            csvEscape(s.lmsUser?.email ?? ""),
            csvEscape(s.lmsUser?.fullName ?? ""),
            csvEscape(s.operatorTakeoverAt?.toISOString() ?? ""),
          ].join(",")
        );
      }
      const csv = "﻿" + lines.join("\n");
      const fname = `subscribers_${bot.externalAccountId}_${new Date()
        .toISOString()
        .slice(0, 10)}.csv`;

      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${fname}"`,
        },
      });
    },
    { roles: [UserRole.admin] }
  );
}
