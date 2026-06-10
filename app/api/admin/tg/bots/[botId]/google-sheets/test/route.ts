/**
 * app/api/admin/tg/bots/[botId]/google-sheets/test/route.ts
 *
 * POST — проверка вебхука: выгружает самого свежего подписчика бота
 * (или тестовую строку, если подписчиков нет). Возвращает ok/error,
 * чтобы админ сразу увидел, работает ли Apps Script.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-middleware";
import {
  exportSubscriberToSheet,
  DEFAULT_SHEET_COLUMNS,
} from "@/lib/tg/google-sheets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ botId: string }> }
) {
  const { botId } = await params;
  return withAuth(
    req,
    async () => {
      const cfg = await db.tgGoogleSheetsConfig.findUnique({ where: { botId } });
      if (!cfg || !cfg.webhookUrl) {
        return NextResponse.json(
          { success: false, error: "Сначала укажите Webhook URL и сохраните." },
          { status: 400 }
        );
      }

      // Берём самого свежего подписчика для реалистичной проверки.
      const sub = await db.tgSubscriber.findFirst({
        where: { botId },
        orderBy: { subscribedAt: "desc" },
        select: { id: true },
      });

      if (sub) {
        const r = await exportSubscriberToSheet(botId, sub.id, "test");
        return NextResponse.json({ success: r.ok, error: r.error ?? null });
      }

      // Нет подписчиков — шлём dummy-строку напрямую, чтобы проверить URL.
      const columns =
        Array.isArray(cfg.columns) && cfg.columns.length > 0
          ? (cfg.columns as Array<{ field: string; header: string }>)
          : DEFAULT_SHEET_COLUMNS;
      const headers = columns.map((c) => c.header);
      const row = columns.map(() => "тест");
      try {
        const resp = await fetch(cfg.webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            secret: cfg.secret || undefined,
            key: "test_" + Date.now(),
            headers,
            row,
            reason: "test",
          }),
          signal: AbortSignal.timeout(15_000),
        });
        if (!resp.ok) {
          const text = await resp.text().catch(() => "");
          return NextResponse.json({
            success: false,
            error: `HTTP ${resp.status} ${text.slice(0, 200)}`,
          });
        }
        return NextResponse.json({ success: true });
      } catch (e) {
        return NextResponse.json({
          success: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    },
    { roles: ["admin"] }
  );
}
