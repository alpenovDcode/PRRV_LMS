import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { UserRole } from "@prisma/client";
import { recordEvent, EVENT_TYPES } from "@/lib/messaging/events";

/**
 * POST /api/admin/messaging/subscribers/[id]/takeover
 * Оператор берёт диалог под ручное управление. Auto-triggers и flow
 * для этого подписчика отключаются (dispatcher проверяет
 * operatorTakeoverAt и выходит).
 *
 * DELETE — возвращает диалог боту (operatorTakeoverAt = null).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    req,
    async (authedReq) => {
      const { id } = await params;
      const updated = await db.messagingSubscriber.update({
        where: { id },
        data: {
          operatorTakeoverAt: new Date(),
          operatorAssigneeId: authedReq.user!.userId,
        } as any,
      });
      await recordEvent({
        botId: updated.botId,
        type: EVENT_TYPES.OPERATOR_TAKEOVER,
        subscriberId: id,
        data: { operatorId: authedReq.user!.userId },
      });
      return NextResponse.json({ success: true });
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    req,
    async (authedReq) => {
      const { id } = await params;
      const updated = await db.messagingSubscriber.update({
        where: { id },
        data: { operatorTakeoverAt: null, operatorAssigneeId: null } as any,
      });
      await recordEvent({
        botId: updated.botId,
        type: EVENT_TYPES.OPERATOR_RELEASE,
        subscriberId: id,
        data: { operatorId: authedReq.user!.userId },
      });
      return NextResponse.json({ success: true });
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}
