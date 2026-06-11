/**
 * /api/admin/tg/bots/[botId]/channels/[channelId]/baseline
 *
 * POST — обновить baseline (текущее число членов канала). Полезно, если
 *        канал жил без нас и нам нужно «зафиксировать N до старта учёта».
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-middleware";
import { tgGetChatMemberCount } from "@/lib/tg/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params: paramsP }: { params: Promise<{ botId: string; channelId: string }> }
) {
  const params = await paramsP;
  return withAuth(
    request,
    async () => {
      const channel = await db.tgChannel.findFirst({
        where: { id: params.channelId, botId: params.botId },
      });
      if (!channel) {
        return NextResponse.json(
          { success: false, error: { code: "NOT_FOUND", message: "Канал не найден" } },
          { status: 404 }
        );
      }
      const bot = await db.tgBot.findUnique({
        where: { id: params.botId },
        select: { tokenEncrypted: true },
      });
      if (!bot) {
        return NextResponse.json(
          { success: false, error: { code: "NOT_FOUND", message: "Бот не найден" } },
          { status: 404 }
        );
      }
      const res = await tgGetChatMemberCount(bot.tokenEncrypted, channel.chatId);
      if (!res.ok) {
        return NextResponse.json(
          {
            success: false,
            error: { code: "TG_ERROR", message: res.description || "getChatMemberCount упал" },
          },
          { status: 400 }
        );
      }
      const updated = await db.tgChannel.update({
        where: { id: channel.id },
        data: { baselineCount: Number(res.result) || 0, baselineAt: new Date() },
      });
      return NextResponse.json({ success: true, data: updated });
    },
    { roles: ["admin"] }
  );
}
