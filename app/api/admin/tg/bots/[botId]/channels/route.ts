/**
 * /api/admin/tg/bots/[botId]/channels
 *
 *   GET  — список подключённых каналов с агрегатами (members_now / left).
 *   POST — подключить канал. На вход chatId ИЛИ @username; запрашиваем
 *          getChat + getChatMemberCount у Telegram (бот обязан быть админом).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-middleware";
import { tgGetChat, tgGetChatMemberCount, tgSetWebhook } from "@/lib/tg/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params: paramsP }: { params: Promise<{ botId: string }> }
) {
  const params = await paramsP;
  return withAuth(
    request,
    async () => {
      const channels = await db.tgChannel.findMany({
        where: { botId: params.botId },
        orderBy: { createdAt: "desc" },
      });
      // Поагрегатно: членов сейчас vs всего отслеживалось.
      const stats = await db.tgChannelMembership.groupBy({
        by: ["channelId", "status"],
        where: { botId: params.botId },
        _count: { _all: true },
      });
      const byChannel = new Map<string, { membersNow: number; total: number }>();
      for (const r of stats) {
        const cur = byChannel.get(r.channelId) ?? { membersNow: 0, total: 0 };
        cur.total += r._count._all;
        if (r.status !== "left" && r.status !== "kicked") {
          cur.membersNow += r._count._all;
        }
        byChannel.set(r.channelId, cur);
      }
      const data = channels.map((c) => ({
        ...c,
        membersNow: byChannel.get(c.id)?.membersNow ?? 0,
        trackedTotal: byChannel.get(c.id)?.total ?? 0,
      }));
      return NextResponse.json({ success: true, data });
    },
    { roles: ["admin"] }
  );
}

const createSchema = z.object({
  // Один из двух обязателен: chatId (-100…) или username (@channelname).
  chatId: z.string().optional(),
  username: z.string().optional(),
});

export async function POST(
  request: NextRequest,
  { params: paramsP }: { params: Promise<{ botId: string }> }
) {
  const params = await paramsP;
  return withAuth(
    request,
    async (req) => {
      const body = await req.json().catch(() => null);
      const parsed = createSchema.safeParse(body);
      if (!parsed.success || (!parsed.data.chatId && !parsed.data.username)) {
        return NextResponse.json(
          {
            success: false,
            error: { code: "BAD_INPUT", message: "Укажите chatId или username канала" },
          },
          { status: 400 }
        );
      }
      const bot = await db.tgBot.findUnique({
        where: { id: params.botId },
        select: {
          id: true,
          tokenEncrypted: true,
          webhookUrl: true,
          webhookSecret: true,
          connectionMode: true,
        },
      });
      if (!bot) {
        return NextResponse.json(
          { success: false, error: { code: "NOT_FOUND", message: "Бот не найден" } },
          { status: 404 }
        );
      }

      const target =
        parsed.data.chatId ||
        (parsed.data.username?.startsWith("@")
          ? parsed.data.username
          : `@${parsed.data.username}`);

      const info = await tgGetChat(bot.tokenEncrypted, target);
      if (!info.ok || !info.result) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "TG_ERROR",
              message:
                info.description ||
                "Telegram не отдал getChat. Убедитесь, что бот — админ канала.",
            },
          },
          { status: 400 }
        );
      }
      if (info.result.type !== "channel" && info.result.type !== "supergroup") {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "WRONG_TYPE",
              message: "Поддерживаются только каналы и супергруппы",
            },
          },
          { status: 400 }
        );
      }

      const count = await tgGetChatMemberCount(bot.tokenEncrypted, info.result.id);
      const baseline = count.ok ? Number(count.result) || 0 : 0;

      const created = await db.tgChannel.upsert({
        where: {
          botId_chatId: { botId: bot.id, chatId: String(info.result.id) },
        },
        create: {
          botId: bot.id,
          chatId: String(info.result.id),
          username: info.result.username,
          title: info.result.title || info.result.username || "Канал",
          type: info.result.type,
          baselineCount: baseline,
          baselineAt: new Date(),
          isActive: true,
        },
        update: {
          username: info.result.username,
          title: info.result.title || info.result.username || "Канал",
          type: info.result.type,
          isActive: true,
        },
      });

      // Бот мог быть зарегистрирован до того, как мы стали слать
      // chat_member в allowed_updates. Перерегистрируем webhook с
      // дефолтным набором — best-effort, ошибки не валят запрос.
      if (
        bot.connectionMode === "webhook" &&
        bot.webhookUrl &&
        bot.webhookSecret
      ) {
        tgSetWebhook(bot.tokenEncrypted, bot.webhookUrl, bot.webhookSecret).catch(
          () => undefined
        );
      }

      return NextResponse.json({ success: true, data: created });
    },
    { roles: ["admin"] }
  );
}
