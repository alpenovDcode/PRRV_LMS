/**
 * app/api/admin/messaging/bots/[id]/scheduled-flows/[scheduleId]/route.ts
 *
 * DELETE — отменить запланированный запуск. Действует только пока
 * status === scheduled. Если воркер уже подхватил (running) или
 * запуск завершён (completed/failed) — отдаём 409.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-middleware";
import { UserRole } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string; scheduleId: string }> }
) {
  const params = await paramsP;
  return withAuth(
    req,
    async () => {
      const sched = await db.messagingScheduledFlow.findUnique({
        where: { id: params.scheduleId },
      });
      if (!sched || sched.botId !== params.id) {
        return NextResponse.json(
          { success: false, error: "Не найдено" },
          { status: 404 }
        );
      }
      if (sched.status !== "scheduled") {
        return NextResponse.json(
          {
            success: false,
            error: `Нельзя отменить — статус "${sched.status}". Отмена работает только для scheduled.`,
          },
          { status: 409 }
        );
      }
      // Optimistic — race-safe: если воркер уже взял в running между
      // нашим findUnique и updateMany, обновится 0 строк, отдадим 409.
      const updated = await db.messagingScheduledFlow.updateMany({
        where: { id: params.scheduleId, status: "scheduled" },
        data: { status: "cancelled", finishedAt: new Date() },
      });
      if (updated.count === 0) {
        return NextResponse.json(
          {
            success: false,
            error: "Не удалось отменить — воркер уже подхватил расписание",
          },
          { status: 409 }
        );
      }
      return NextResponse.json({ success: true });
    },
    { roles: [UserRole.admin] }
  );
}
