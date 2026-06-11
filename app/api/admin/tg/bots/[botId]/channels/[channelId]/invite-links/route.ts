/**
 * /api/admin/tg/bots/[botId]/channels/[channelId]/invite-links
 *
 *   GET  — список именных трекинг-ссылок на канал + UTM/метрики.
 *   POST — создать новую через Telegram createChatInviteLink, сохранить URL.
 *
 *  name — наш slug, ≤32 chars (ограничение Telegram). Должен быть
 *  уникальным в рамках канала. По name Telegram потом вернёт привязку
 *  в chat_member.invite_link.name → атрибуция join'ов.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-middleware";
import { tgCreateChatInviteLink } from "@/lib/tg/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params: paramsP }: { params: Promise<{ botId: string; channelId: string }> }
) {
  const params = await paramsP;
  return withAuth(
    request,
    async () => {
      const links = await db.tgChannelInviteLink.findMany({
        where: { botId: params.botId, channelId: params.channelId },
        orderBy: { createdAt: "desc" },
      });
      return NextResponse.json({ success: true, data: links });
    },
    { roles: ["admin"] }
  );
}

const createSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(32, "Telegram ограничивает имя трекинг-ссылки 32 символами"),
  memberLimit: z.number().int().positive().optional(),
  expiresAt: z.coerce.date().optional(),
  utm: z.record(z.string(), z.string()).optional(),
});

export async function POST(
  request: NextRequest,
  { params: paramsP }: { params: Promise<{ botId: string; channelId: string }> }
) {
  const params = await paramsP;
  return withAuth(
    request,
    async (req) => {
      const body = await req.json().catch(() => null);
      const parsed = createSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, error: { code: "BAD_INPUT", message: parsed.error.message } },
          { status: 400 }
        );
      }
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
      const tg = await tgCreateChatInviteLink(bot.tokenEncrypted, channel.chatId, {
        name: parsed.data.name,
        memberLimit: parsed.data.memberLimit,
        expireDate: parsed.data.expiresAt,
      });
      if (!tg.ok || !tg.result) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "TG_ERROR",
              message:
                tg.description ||
                "createChatInviteLink упал. Бот точно админ и может приглашать?",
            },
          },
          { status: 400 }
        );
      }
      try {
        const link = await db.tgChannelInviteLink.create({
          data: {
            botId: params.botId,
            channelId: channel.id,
            name: parsed.data.name,
            inviteUrl: tg.result.invite_link,
            utm: (parsed.data.utm ?? {}) as object,
            memberLimit: parsed.data.memberLimit,
            expiresAt: parsed.data.expiresAt,
          },
        });
        return NextResponse.json({ success: true, data: link });
      } catch (e) {
        const code = (e as { code?: string }).code;
        if (code === "P2002") {
          return NextResponse.json(
            {
              success: false,
              error: {
                code: "DUPLICATE_NAME",
                message: "Ссылка с таким именем уже есть в этом канале",
              },
            },
            { status: 409 }
          );
        }
        throw e;
      }
    },
    { roles: ["admin"] }
  );
}
