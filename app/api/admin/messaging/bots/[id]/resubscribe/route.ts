import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { UserRole } from "@prisma/client";
import { decrypt } from "@/lib/messaging/encryption";
import { subscribeToMessagingWebhook } from "@/lib/messaging/instagram/oauth";

/**
 * POST /api/admin/messaging/bots/[id]/resubscribe
 *
 * Повторно активирует подписку на webhook-поля (messages / messaging_postbacks
 * / comments) на уровне IG-аккаунта, используя сохранённый в БД токен.
 *
 * Нужно, когда аккаунт уже подключён, но подписка слетела или не активировалась
 * (например, исторически вызов subscribe падал). Избавляет от полного реконнекта
 * через OAuth.
 *
 * Только для каналов instagram. Только admin.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    req,
    async () => {
      const { id } = await params;

      const bot = await db.messagingBot.findUnique({ where: { id } });
      if (!bot) {
        return NextResponse.json(
          { success: false, error: "Бот не найден" },
          { status: 404 }
        );
      }
      if (bot.channel !== "instagram") {
        return NextResponse.json(
          { success: false, error: "Переподписка доступна только для Instagram" },
          { status: 400 }
        );
      }

      let token: string;
      try {
        token = decrypt(bot.tokenEnc);
      } catch {
        return NextResponse.json(
          {
            success: false,
            error:
              "Не удалось расшифровать токен. Переподключите аккаунт через OAuth.",
          },
          { status: 400 }
        );
      }

      try {
        await subscribeToMessagingWebhook(bot.externalAccountId, token);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[bot/resubscribe] failed:", msg);
        return NextResponse.json(
          {
            success: false,
            error:
              "Подписка не удалась: " +
              msg +
              ". Если токен истёк (60 дней) — переподключите аккаунт.",
          },
          { status: 400 }
        );
      }

      return NextResponse.json({
        success: true,
        message:
          "Подписка активирована: messages, messaging_postbacks, comments. " +
          "Напишите боту в DM или оставьте комментарий для проверки.",
      });
    },
    { roles: [UserRole.admin] }
  );
}
