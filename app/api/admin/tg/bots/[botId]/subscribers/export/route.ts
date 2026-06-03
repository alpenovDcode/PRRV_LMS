/**
 * GET /api/admin/tg/bots/[botId]/subscribers/export
 *
 * Скачивание всех подписчиков бота в CSV. UTF-8 с BOM (открывается в
 * Excel русской локали без kraбля), разделитель `;` (запятые из текста
 * не ломают колонки, и UTM с запятыми сохраняются как есть).
 *
 * Колонки фиксированные — менять порядок осторожно, на них могут быть
 * завязаны IMPORTDATA / автоматические выгрузки в Google Sheets.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-middleware";
import { UserRole } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLUMNS = [
  "chat_id",
  "username",
  "first_name",
  "last_name",
  "email",
  "phone",
  "tags",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "first_touch_slug",
  "first_touch_at",
  "last_touch_slug",
  "last_touch_at",
  "subscribed_at",
  "last_seen_at",
  "is_blocked",
] as const;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ botId: string }> }
) {
  return withAuth(
    req,
    async () => {
      const { botId } = await params;

      const bot = await db.tgBot.findUnique({
        where: { id: botId },
        select: { id: true, username: true },
      });
      if (!bot) {
        return NextResponse.json(
          { success: false, error: "Бот не найден" },
          { status: 404 }
        );
      }

      const subscribers = await db.tgSubscriber.findMany({
        where: { botId },
        orderBy: { subscribedAt: "asc" },
        select: {
          chatId: true,
          username: true,
          firstName: true,
          lastName: true,
          tags: true,
          variables: true,
          firstTouchSlug: true,
          firstTouchAt: true,
          lastTouchSlug: true,
          lastTouchAt: true,
          subscribedAt: true,
          lastSeenAt: true,
          isBlocked: true,
        },
      });

      // BOM для Excel-русской локали + строка заголовков.
      const rows: string[] = ["﻿" + COLUMNS.join(";")];

      for (const s of subscribers) {
        const vars = (s.variables as Record<string, unknown> | null) ?? {};
        const v = (k: string) => {
          const raw = vars[k];
          if (raw == null) return "";
          return String(raw);
        };

        const row = [
          s.chatId,
          s.username ?? "",
          s.firstName ?? "",
          s.lastName ?? "",
          v("email"),
          v("phone"),
          (s.tags ?? []).join(","),
          v("utm_source"),
          v("utm_medium"),
          v("utm_campaign"),
          v("utm_content"),
          v("utm_term"),
          s.firstTouchSlug ?? "",
          s.firstTouchAt ? s.firstTouchAt.toISOString() : "",
          s.lastTouchSlug ?? "",
          s.lastTouchAt ? s.lastTouchAt.toISOString() : "",
          s.subscribedAt.toISOString(),
          s.lastSeenAt ? s.lastSeenAt.toISOString() : "",
          s.isBlocked ? "1" : "0",
        ];

        rows.push(row.map(csvEscape).join(";"));
      }

      const csv = rows.join("\r\n");
      // Имя файла: subscribers_<botUsername>_<YYYY-MM-DD>.csv
      const date = new Date().toISOString().slice(0, 10);
      const filename = `subscribers_${bot.username || botId}_${date}.csv`;

      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store",
        },
      });
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}

/**
 * Минимальный CSV-эскейпер для разделителя `;`:
 * оборачиваем в кавычки, если есть `;`, `"`, переводы строк или ведущие
 * нули (часто phone/chat_id) — иначе Excel может срезать их как «число».
 */
function csvEscape(value: string): string {
  const needsQuote =
    value.includes(";") ||
    value.includes('"') ||
    value.includes("\n") ||
    value.includes("\r") ||
    /^0\d/.test(value); // защита для chat_id/phone начинающихся с 0
  if (!needsQuote) return value;
  return `"${value.replace(/"/g, '""')}"`;
}
