import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { UserRole } from "@prisma/client";
import { decrypt } from "@/lib/messaging/encryption";
import { unsubscribeFromMessagingWebhook } from "@/lib/messaging/instagram/oauth";

/**
 * GET /api/admin/messaging/bots/[id] — данные одного бота.
 *
 * Нужно для шапки страницы /admin/messaging/[botId]/* (layout рисует
 * заголовок «<title> · <externalAccountId> · N подписчиков»). Не отдаём
 * tokenEnc — он только для серверных вызовов API мессенджера.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    req,
    async () => {
      const { id } = await params;
      const bot = await db.messagingBot.findUnique({
        where: { id },
        select: {
          id: true,
          channel: true,
          externalAccountId: true,
          title: true,
          isActive: true,
          tokenExpiresAt: true,
          meta: true,
          createdAt: true,
          _count: { select: { subscribers: true } },
        },
      });
      if (!bot) {
        return NextResponse.json(
          { success: false, error: "Бот не найден" },
          { status: 404 }
        );
      }
      return NextResponse.json({
        success: true,
        data: {
          ...bot,
          subscriberCount: bot._count.subscribers,
        },
      });
    },
    { roles: [UserRole.admin] }
  );
}

/**
 * DELETE /api/admin/messaging/bots/[id]?mode=disable|delete
 *
 * mode=disable (по умолчанию) — soft: isActive = false. Можно переподключить
 *   тот же аккаунт через OAuth, упсёрт оживит запись со всей историей.
 *
 * mode=delete — hard: полное удаление + отписка от Meta webhook.
 *   Каскадом удаляются подписчики, воронки, runs, триггеры.
 *   Если позже подключишь тот же аккаунт — получишь чистую запись с нуля.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    req,
    async () => {
      const { id } = await params;
      const url = new URL(req.url);
      const mode = url.searchParams.get("mode") === "delete" ? "delete" : "disable";

      const bot = await db.messagingBot.findUnique({ where: { id } });
      if (!bot) {
        return NextResponse.json({ success: false, error: "Не найдено" }, { status: 404 });
      }

      if (mode === "disable") {
        await db.messagingBot.update({
          where: { id },
          data: { isActive: false },
        });
        return NextResponse.json({ success: true, mode: "disable" });
      }

      // Hard delete: пытаемся отписаться от Meta webhook (best-effort)
      let unsubscribed = false;
      if (bot.channel === "instagram") {
        try {
          unsubscribed = await unsubscribeFromMessagingWebhook(
            bot.externalAccountId,
            decrypt(bot.tokenEnc)
          );
        } catch (e) {
          // Токен мог истечь или быть отозван — продолжаем удаление
          console.warn("[bot/delete] unsubscribe failed:", e);
        }
      }

      // Каскадное удаление: subscribers, flows, runs, triggers через FK ON DELETE CASCADE
      await db.messagingBot.delete({ where: { id } });

      return NextResponse.json({
        success: true,
        mode: "delete",
        webhookUnsubscribed: unsubscribed,
      });
    },
    { roles: [UserRole.admin] }
  );
}
