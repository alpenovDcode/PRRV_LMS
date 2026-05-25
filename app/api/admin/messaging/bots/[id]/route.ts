import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { UserRole } from "@prisma/client";

/** DELETE /api/admin/messaging/bots/[id] — отключить аккаунт */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    req,
    async () => {
      const { id } = await params;
      // Soft-disconnect: помечаем неактивным, токен оставляем для аудита.
      // Если нужно полностью убрать — отдельная команда DELETE с ?hard=true.
      const hard = new URL(req.url).searchParams.get("hard") === "true";

      if (hard) {
        await db.messagingBot.delete({ where: { id } });
      } else {
        await db.messagingBot.update({
          where: { id },
          data: { isActive: false },
        });
      }
      return NextResponse.json({ success: true });
    },
    { roles: [UserRole.admin] }
  );
}
