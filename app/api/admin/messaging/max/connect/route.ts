import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { getMe, subscribeWebhook } from "@/lib/messaging/max/api";
import { encrypt } from "@/lib/messaging/encryption";
import { getMaxWebhookUrl } from "@/lib/messaging/max/config";
import { logAction } from "@/lib/audit";

const schema = z.object({
  token: z.string().min(10).max(500),
});

/**
 * POST /api/admin/messaging/max/connect
 *
 * Подключение MAX-бота по токену.
 *
 *   1. Валидируем токен через GET /me — MAX вернёт инфу о боте.
 *   2. Регистрируем webhook (POST /subscriptions).
 *   3. Upsert MessagingBot — токен шифруется через TG_TOKEN_ENC_KEY.
 *
 * Если бот уже был подключён раньше — обновляется токен и активируется.
 */
export async function POST(req: NextRequest) {
  return withAuth(
    req,
    async (authedReq) => {
      const body = await req.json().catch(() => null);
      const parsed = schema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, error: "Не передан токен" },
          { status: 400 }
        );
      }
      const { token } = parsed.data;

      // 1. Валидация токена через getMe
      let me;
      try {
        me = await getMe(token);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json(
          { success: false, error: `Неверный токен или MAX недоступен: ${msg.slice(0, 200)}` },
          { status: 400 }
        );
      }

      if (!me.is_bot) {
        return NextResponse.json(
          { success: false, error: "Этот токен не от бота. Получи токен у @MasterBot в MAX." },
          { status: 400 }
        );
      }

      // 2. Subscribe webhook
      const webhookUrl = getMaxWebhookUrl();
      try {
        await subscribeWebhook(token, webhookUrl);
      } catch (e) {
        console.warn("[max-connect] webhook subscribe failed:", e);
        // Не блокируем подключение — webhook можно подписать позже через retry.
        // Возможно URL не доступен извне (dev), позволяем создать бота.
      }

      // 3. Upsert MessagingBot
      const tokenEnc = encrypt(token);
      const bot = await db.messagingBot.upsert({
        where: {
          channel_externalAccountId: {
            channel: "max",
            externalAccountId: String(me.user_id),
          },
        },
        update: {
          title: me.username ? `@${me.username}` : me.name,
          tokenEnc,
          tokenExpiresAt: null, // MAX-токены не истекают
          isActive: true,
          ownerId: authedReq.user!.userId,
          meta: { name: me.name, username: me.username ?? null, userId: me.user_id },
        },
        create: {
          channel: "max",
          externalAccountId: String(me.user_id),
          title: me.username ? `@${me.username}` : me.name,
          tokenEnc,
          tokenExpiresAt: null,
          isActive: true,
          ownerId: authedReq.user!.userId,
          meta: { name: me.name, username: me.username ?? null, userId: me.user_id },
        },
      });

      await logAction(
        authedReq.user!.userId,
        "MAX_BOT_CONNECTED",
        "MessagingBot",
        bot.id,
        { name: me.name, username: me.username, userId: me.user_id }
      ).catch(() => {});

      return NextResponse.json({
        success: true,
        data: { botId: bot.id, title: bot.title, name: me.name, username: me.username },
      });
    },
    { roles: [UserRole.admin] }
  );
}
