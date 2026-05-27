import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { UserRole } from "@prisma/client";
import { sendBroadcast } from "@/lib/messaging/broadcast";

/**
 * POST /api/admin/messaging/broadcasts/[id]/send
 *
 * Запустить рассылку немедленно. Только admin. Идемпотентно через
 * статус — повторный вызов на completed не делает ничего.
 *
 * Отправка батчами по 50, может занимать несколько минут. Сейчас
 * выполняется в том же request thread'е — для большого audience
 * лучше вынести в background job (TODO).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    req,
    async () => {
      const { id } = await params;
      try {
        const result = await sendBroadcast(id);
        return NextResponse.json({ success: true, data: result });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ success: false, error: msg }, { status: 400 });
      }
    },
    { roles: [UserRole.admin] }
  );
}
