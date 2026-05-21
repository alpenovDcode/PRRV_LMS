import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { readCronStatus } from "@/lib/tg/cron-heartbeat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin-видимый статус cron’а: жив ли он, когда был последний тик,
// сколько runs/broadcasts он перемолотил. Бот-независимый — крон
// глобальный, не пер-бот. Поэтому endpoint живёт под /admin/tg/cron-status,
// а не /admin/tg/bots/[botId]/...
export async function GET(request: NextRequest) {
  return withAuth(
    request,
    async () => {
      const status = await readCronStatus();
      return NextResponse.json({ success: true, data: status });
    },
    { roles: ["admin"] }
  );
}
