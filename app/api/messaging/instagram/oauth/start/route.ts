import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { UserRole } from "@prisma/client";
import { randomBytes } from "crypto";
import { assertIgConfig, IG_APP_ID } from "@/lib/messaging/instagram/config";
import { buildAuthorizeUrl } from "@/lib/messaging/instagram/oauth";

/**
 * GET /api/messaging/instagram/oauth/start
 *
 * Шаг 1 OAuth-флоу подключения Instagram-аккаунта.
 *
 *   1. Проверяем что Instagram-конфиг задан в env.
 *   2. Генерируем CSRF-state (32 байта random).
 *   3. Сохраняем state в MessagingOAuthState с TTL 10 мин и привязкой
 *      к текущему пользователю (чтобы callback знал, кто инициировал).
 *   4. Строим URL авторизации на стороне Meta и редиректим туда.
 */
export async function GET(req: NextRequest) {
  return withAuth(
    req,
    async (authedReq) => {
      try {
        assertIgConfig();
      } catch (e) {
        return NextResponse.json(
          { success: false, error: e instanceof Error ? e.message : "IG not configured" },
          { status: 503 }
        );
      }

      if (!IG_APP_ID) {
        return NextResponse.json(
          { success: false, error: "IG_APP_ID не задан в env" },
          { status: 503 }
        );
      }

      const state = randomBytes(32).toString("hex");
      await db.messagingOAuthState.create({
        data: {
          state,
          channel: "instagram",
          userId: authedReq.user!.userId,
          expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 минут
        },
      });

      const authorizeUrl = buildAuthorizeUrl(state);

      // Возвращаем JSON с URL — фронт сам сделает редирект через window.location.href.
      // Не делаем редирект напрямую чтобы видеть ошибки в UI.
      return NextResponse.json({ success: true, data: { url: authorizeUrl } });
    },
    { roles: [UserRole.admin] }
  );
}
