/**
 * /api/admin/tg/bots/[botId]/channels/[channelId]/invite-links/[linkId]
 *
 * DELETE — отозвать ссылку через revokeChatInviteLink. Атрибуция уже
 *          накопленных join'ов сохраняется (мы хранили name снэпшотом).
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-middleware";
import { tgRevokeChatInviteLink } from "@/lib/tg/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  request: NextRequest,
  {
    params: paramsP,
  }: { params: Promise<{ botId: string; channelId: string; linkId: string }> }
) {
  const params = await paramsP;
  return withAuth(
    request,
    async () => {
      const link = await db.tgChannelInviteLink.findFirst({
        where: {
          id: params.linkId,
          botId: params.botId,
          channelId: params.channelId,
        },
      });
      if (!link) {
        return NextResponse.json(
          { success: false, error: { code: "NOT_FOUND", message: "Ссылка не найдена" } },
          { status: 404 }
        );
      }
      const channel = await db.tgChannel.findUnique({
        where: { id: link.channelId },
        select: { chatId: true },
      });
      const bot = await db.tgBot.findUnique({
        where: { id: params.botId },
        select: { tokenEncrypted: true },
      });
      if (bot && channel) {
        // Best-effort: отзов на стороне Telegram. Сами всегда помечаем.
        await tgRevokeChatInviteLink(bot.tokenEncrypted, channel.chatId, link.inviteUrl).catch(
          () => undefined
        );
      }
      await db.tgChannelInviteLink.update({
        where: { id: link.id },
        data: { revokedAt: new Date() },
      });
      return NextResponse.json({ success: true });
    },
    { roles: ["admin"] }
  );
}
