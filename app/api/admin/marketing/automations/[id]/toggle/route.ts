import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";
import { logAction } from "@/lib/audit";

/**
 * POST /api/admin/marketing/automations/[id]/toggle
 *
 * Включить / выключить автоматизацию. Body: { isActive: boolean }.
 *
 * Выключение НЕ останавливает уже запущенные runs мгновенно — они
 * пройдут текущий шаг, потом process-automations увидит isActive=false
 * и отменит. Это сделано намеренно, чтобы не было гонки между чтением
 * и обновлением статуса.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    request,
    async (req) => {
      const { id } = await params;
      const body = await request.json().catch(() => ({}));
      const isActive = body.isActive === true;

      const existing = await db.emailAutomation.findUnique({
        where: { id },
        select: { name: true, isActive: true },
      });
      if (!existing) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: { code: "NOT_FOUND", message: "Не найдена" } },
          { status: 404 }
        );
      }

      const updated = await db.emailAutomation.update({
        where: { id },
        data: { isActive },
      });

      await logAction(
        req.user!.userId,
        isActive ? "EMAIL_AUTOMATION_ACTIVATE" : "EMAIL_AUTOMATION_DEACTIVATE",
        "EmailAutomation",
        id,
        { name: existing.name }
      );

      return NextResponse.json<ApiResponse>({
        success: true,
        data: { id, isActive: updated.isActive },
      });
    },
    { roles: [UserRole.admin] }
  );
}
