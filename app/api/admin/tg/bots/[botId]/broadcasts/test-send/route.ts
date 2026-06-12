/**
 * POST /api/admin/tg/bots/[botId]/broadcasts/test-send
 *
 * Тестовая отправка макета рассылки на список подписчиков. Никаких
 * записей в TgBroadcast/TgBroadcastRecipient не создаём — это разовая
 * отправка для проверки сообщения. sourceType=manual, чтобы:
 *   • в forwarded-режиме (Наблюдатель) сообщения проходили,
 *   • URL-кнопки рерайтились через /r/<slug> для каждого получателя,
 *   • в counts/CTR основного отчёта не попадало шумовое число.
 *
 * Получатели — массив chat_id (строки/числа), либо массив subscriber-id
 * (uuid). Лимит 5 — это тестовая отправка, не способ обойти segments.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-middleware";
import { messagePayloadSchema } from "@/lib/tg/flow-schema";
import { sendBotMessage } from "@/lib/tg/sender";
import { buildEvalContext, snapBot, snapSubscriber } from "@/lib/tg/vars";
import { rewriteUrlButtons } from "@/lib/tg/redirect-tracking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const testSendSchema = z.object({
  message: messagePayloadSchema,
  // Можно прислать chat_id (как видны в админке) или subscriberId (uuid).
  // Поиск гибкий: сначала по chat_id, если не нашли — по id.
  recipients: z.array(z.string().min(1)).min(1).max(5),
});

export async function POST(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ botId: string }> }
) {
  const params = await paramsP;
  return withAuth(
    req,
    async (request) => {
      const body = await request.json().catch(() => null);
      const parsed = testSendSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, error: { code: "BAD_INPUT", message: parsed.error.message } },
          { status: 400 }
        );
      }

      const bot = await db.tgBot.findUnique({ where: { id: params.botId } });
      if (!bot) {
        return NextResponse.json(
          { success: false, error: { code: "NOT_FOUND", message: "Бот не найден" } },
          { status: 404 }
        );
      }

      const idsOrChatIds = parsed.data.recipients.map((s) => s.trim()).filter(Boolean);
      const subs = await db.tgSubscriber.findMany({
        where: {
          botId: bot.id,
          OR: [
            { chatId: { in: idsOrChatIds } },
            { id: { in: idsOrChatIds } },
          ],
        },
      });

      if (subs.length === 0) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Не найдено ни одного подписчика по этим chat_id / id",
            },
          },
          { status: 404 }
        );
      }

      const results: Array<{
        chatId: string;
        ok: boolean;
        error?: string;
      }> = [];
      for (const s of subs) {
        try {
          const payload = await rewriteUrlButtons({
            payload: parsed.data.message,
            botId: bot.id,
            subscriberId: s.id,
          }).catch(() => parsed.data.message);

          const res = await sendBotMessage({
            botId: bot.id,
            encryptedToken: bot.tokenEncrypted,
            subscriberId: s.id,
            chatId: s.chatId,
            payload,
            renderCtx: buildEvalContext({
              subscriber: snapSubscriber(s),
              bot: snapBot(bot),
            }),
            sourceType: "manual",
          });
          results.push({
            chatId: s.chatId,
            ok: res.ok,
            // Пробрасываем точную ошибку Telegram (errorCode + description)
            // — иначе админ видит «send failed» и не знает, что чинить.
            error: res.ok
              ? undefined
              : res.errorMessage
              ? `${res.errorCode ? `[${res.errorCode}] ` : ""}${res.errorMessage}`
              : res.blocked
              ? "пользователь заблокировал бота"
              : "Telegram отверг сообщение",
          });
        } catch (e) {
          results.push({
            chatId: s.chatId,
            ok: false,
            error: (e as Error).message ?? "unknown",
          });
        }
      }

      const sent = results.filter((r) => r.ok).length;
      const missing = idsOrChatIds.filter(
        (raw) => !subs.some((s) => s.chatId === raw || s.id === raw)
      );

      return NextResponse.json({
        success: true,
        data: { sent, total: idsOrChatIds.length, results, missing },
      });
    },
    { roles: ["admin"] }
  );
}
