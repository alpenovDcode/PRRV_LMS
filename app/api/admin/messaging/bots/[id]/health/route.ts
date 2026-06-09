/**
 * app/api/admin/messaging/bots/[id]/health/route.ts
 *
 * Проверка здоровья MAX/мессенджер-бота — аналог webhookInfo+getMe у
 * TG-бота. На уровне MAX API health-check складывается из 3 источников:
 *
 *   1. `getMe(token)` — токен валиден и совпадает с записью
 *      (externalAccountId должен сходиться с user_id из ответа).
 *   2. Последнее входящее сообщение из БД (MessagingMessage) —
 *      даёт качественный сигнал «бот реально работает», даже если MAX
 *      не отдаёт нам нативный getWebhookInfo.
 *   3. У Instagram-ботов проверяем срок жизни long-lived токена
 *      (MessagingBot.tokenExpiresAt).
 *
 * Ответ:
 *   tokenValid       — true/false, токен ответил на getMe.
 *   tokenMatches     — true/false, user_id совпадает с externalAccountId.
 *   tokenError       — message ошибки от MAX (если упало).
 *   botName          — name из ответа getMe (для подсказки).
 *   lastInboundAt    — ISO последнего входящего MessagingMessage.
 *   tokenExpiresAt   — ISO, либо null. Если в окне «истечёт за 7 дней» —
 *                       UI красит в оранжевый.
 *
 * Эндпоинт делает реальный HTTP-запрос к MAX. Не злоупотребляйте — UI
 * вызывает его только при открытии страницы и кнопке «Обновить»,
 * автообновления нет.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { UserRole } from "@prisma/client";
import { decrypt } from "@/lib/messaging/encryption";
import { getMe as maxGetMe } from "@/lib/messaging/max/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    request,
    async () => {
      const { id } = await params;
      const bot = await db.messagingBot.findUnique({
        where: { id },
        select: {
          id: true,
          channel: true,
          externalAccountId: true,
          tokenEnc: true,
          tokenExpiresAt: true,
          isActive: true,
        },
      });
      if (!bot) {
        return NextResponse.json(
          { success: false, error: "Бот не найден" },
          { status: 404 }
        );
      }

      // ── tokenValid: дёрнем getMe только для MAX. У IG отдельный
      // механизм проверки (через Graph API) — оставим на этап IG-health,
      // если потребуется.
      let tokenValid = false;
      let tokenMatches = false;
      let tokenError: string | null = null;
      let botName: string | null = null;

      if (bot.channel === "max") {
        try {
          const token = decrypt(bot.tokenEnc);
          const me = await maxGetMe(token);
          tokenValid = true;
          tokenMatches = String(me.user_id) === bot.externalAccountId;
          botName = me.name ?? me.username ?? null;
        } catch (e) {
          tokenError = e instanceof Error ? e.message : String(e);
        }
      } else {
        // Для других каналов токен формально валиден, если запись активна
        // и токен расшифровывается. Полноценный health добавим позже.
        try {
          decrypt(bot.tokenEnc);
          tokenValid = true;
          tokenMatches = true;
        } catch (e) {
          tokenError = e instanceof Error ? e.message : String(e);
        }
      }

      // ── lastInboundAt: качественный сигнал «бот реально работает».
      const lastInbound = await db.messagingMessage.findFirst({
        where: { botId: id, direction: "in" },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      });

      return NextResponse.json({
        success: true,
        data: {
          channel: bot.channel,
          isActive: bot.isActive,
          tokenValid,
          tokenMatches,
          tokenError,
          botName,
          externalAccountId: bot.externalAccountId,
          tokenExpiresAt: bot.tokenExpiresAt?.toISOString() ?? null,
          lastInboundAt: lastInbound?.createdAt.toISOString() ?? null,
        },
      });
    },
    { roles: [UserRole.admin] }
  );
}
