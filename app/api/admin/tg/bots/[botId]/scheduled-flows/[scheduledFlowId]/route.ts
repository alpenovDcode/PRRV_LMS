import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-middleware";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// DELETE — отменить (если ещё scheduled) или удалить запись историю.
// Запись со статусом scheduled переводим в cancelled (трассируемость).
// Любой другой статус — удаляем полностью.
export async function DELETE(
  request: NextRequest,
  {
    params: paramsP,
  }: { params: Promise<{ botId: string; scheduledFlowId: string }> }
) {
  const params = await paramsP;
  return withAuth(
    request,
    async () => {
      const existing = await db.tgScheduledFlow.findFirst({
        where: { id: params.scheduledFlowId, botId: params.botId },
      });
      if (!existing) {
        return NextResponse.json(
          { success: false, error: { code: "NOT_FOUND", message: "Запись не найдена" } },
          { status: 404 }
        );
      }
      if (existing.status === "scheduled") {
        await db.tgScheduledFlow.update({
          where: { id: existing.id },
          data: { status: "cancelled", finishedAt: new Date() },
        });
        return NextResponse.json({
          success: true,
          data: { action: "cancelled" },
        });
      }
      await db.tgScheduledFlow.delete({ where: { id: existing.id } });
      return NextResponse.json({ success: true, data: { action: "deleted" } });
    },
    { roles: ["admin"] }
  );
}
