/**
 * /api/admin/tg/bots/[botId]/channels/[channelId]
 *
 *   PATCH  — переключить isActive (без удаления накопленных memberships).
 *   DELETE — отключить и удалить канал (memberships каскадно).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-middleware";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({ isActive: z.boolean() });

export async function PATCH(
  request: NextRequest,
  { params: paramsP }: { params: Promise<{ botId: string; channelId: string }> }
) {
  const params = await paramsP;
  return withAuth(
    request,
    async (req) => {
      const body = await req.json().catch(() => null);
      const parsed = patchSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, error: { code: "BAD_INPUT", message: parsed.error.message } },
          { status: 400 }
        );
      }
      const updated = await db.tgChannel.updateMany({
        where: { id: params.channelId, botId: params.botId },
        data: { isActive: parsed.data.isActive },
      });
      if (updated.count === 0) {
        return NextResponse.json(
          { success: false, error: { code: "NOT_FOUND", message: "Канал не найден" } },
          { status: 404 }
        );
      }
      return NextResponse.json({ success: true });
    },
    { roles: ["admin"] }
  );
}

export async function DELETE(
  request: NextRequest,
  { params: paramsP }: { params: Promise<{ botId: string; channelId: string }> }
) {
  const params = await paramsP;
  return withAuth(
    request,
    async () => {
      const deleted = await db.tgChannel.deleteMany({
        where: { id: params.channelId, botId: params.botId },
      });
      if (deleted.count === 0) {
        return NextResponse.json(
          { success: false, error: { code: "NOT_FOUND", message: "Канал не найден" } },
          { status: 404 }
        );
      }
      return NextResponse.json({ success: true });
    },
    { roles: ["admin"] }
  );
}
