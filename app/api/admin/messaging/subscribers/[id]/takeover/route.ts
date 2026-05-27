import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { UserRole } from "@prisma/client";

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
      await db.messagingSubscriber.update({
        where: { id },
        data: {
          operatorTakeoverAt: new Date(),
          operatorAssigneeId: authedReq.user!.userId,
        } as any,
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
    async () => {
      const { id } = await params;
      await db.messagingSubscriber.update({
        where: { id },
        data: { operatorTakeoverAt: null, operatorAssigneeId: null } as any,
      });
      return NextResponse.json({ success: true });
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}
