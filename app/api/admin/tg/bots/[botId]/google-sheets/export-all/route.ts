/**
 * app/api/admin/tg/bots/[botId]/google-sheets/export-all/route.ts
 *
 * POST — разовая массовая выгрузка ВСЕЙ текущей базы подписчиков в
 * Google-таблицу через настроенный вебхук. Шлёт строки батчами,
 * upsert по chat_id (повторный запуск не плодит дубли).
 *
 * Возвращает { total, sent, failed, error? }.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { exportAllSubscribers } from "@/lib/tg/google-sheets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Большая база может выгружаться дольше — поднимаем лимит.
export const maxDuration = 300;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ botId: string }> }
) {
  const { botId } = await params;
  return withAuth(
    req,
    async () => {
      const result = await exportAllSubscribers(botId);
      return NextResponse.json({
        success: !result.error,
        data: result,
        error: result.error ?? null,
      });
    },
    { roles: ["admin"] }
  );
}
