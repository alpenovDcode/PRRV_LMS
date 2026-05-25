import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { encrypt } from "@/lib/messaging/encryption";
import {
  exchangeCodeForShortToken,
  exchangeShortForLongToken,
  fetchMe,
  subscribeToMessagingWebhook,
} from "@/lib/messaging/instagram/oauth";
import { assertIgConfig } from "@/lib/messaging/instagram/config";

const APP_URL = process.env.PUBLIC_APP_URL ?? "https://prrv.tech";

/**
 * GET /api/messaging/instagram/oauth/callback?code=...&state=...
 *
 * Callback от Meta после авторизации пользователя.
 *
 * Безопасность:
 *   • Проверяем что state есть в БД, не истёк и привязан к каналу instagram.
 *   • После использования state удаляем (one-shot, защита от replay).
 *   • Long-lived токен шифруем перед записью.
 *
 * Идемпотентность:
 *   • Если по (channel, externalAccountId) уже есть бот — обновляем токен
 *     вместо создания дубликата.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  // Юзер отказал в permissions — отдаём ошибку в UI.
  if (errorParam) {
    return Response.redirect(
      `${APP_URL}/admin/bots?ig_error=${encodeURIComponent(errorDescription ?? errorParam)}`,
      302
    );
  }

  if (!code || !state) {
    return Response.redirect(`${APP_URL}/admin/bots?ig_error=missing_params`, 302);
  }

  // ── 1. Проверка state (CSRF) ─────────────────────────────────────────────
  const stateRecord = await db.messagingOAuthState.findUnique({ where: { state } });
  if (!stateRecord) {
    return Response.redirect(`${APP_URL}/admin/bots?ig_error=invalid_state`, 302);
  }
  if (stateRecord.channel !== "instagram") {
    return Response.redirect(`${APP_URL}/admin/bots?ig_error=wrong_channel`, 302);
  }
  if (stateRecord.expiresAt < new Date()) {
    await db.messagingOAuthState.delete({ where: { id: stateRecord.id } }).catch(() => {});
    return Response.redirect(`${APP_URL}/admin/bots?ig_error=state_expired`, 302);
  }

  // One-shot: удаляем state сразу, чтобы исключить replay.
  await db.messagingOAuthState.delete({ where: { id: stateRecord.id } }).catch(() => {});

  const userId = stateRecord.userId;

  try {
    assertIgConfig();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "config error";
    return Response.redirect(`${APP_URL}/admin/bots?ig_error=${encodeURIComponent(msg)}`, 302);
  }

  try {
    // ── 2. Обмен code → short-lived token ──────────────────────────────────
    const shortLived = await exchangeCodeForShortToken(code);

    // ── 3. Short → long-lived (60 дней) ────────────────────────────────────
    const longLived = await exchangeShortForLongToken(shortLived.access_token);

    // ── 4. Получаем info об аккаунте ───────────────────────────────────────
    const me = await fetchMe(longLived.access_token);

    if (me.account_type === "PERSONAL") {
      return Response.redirect(
        `${APP_URL}/admin/bots?ig_error=${encodeURIComponent("Аккаунт должен быть переведён в Business. Сейчас тип: PERSONAL")}`,
        302
      );
    }

    // ── 5. Сохраняем / обновляем бота (upsert по channel+externalAccountId) ─
    const expiresAt = new Date(Date.now() + longLived.expires_in * 1000);
    const tokenEnc = encrypt(longLived.access_token);

    const bot = await db.messagingBot.upsert({
      where: {
        channel_externalAccountId: {
          channel: "instagram",
          externalAccountId: me.id,
        },
      },
      update: {
        title: me.username,
        tokenEnc,
        tokenExpiresAt: expiresAt,
        meta: { accountType: me.account_type, scopes: shortLived.permissions ?? [] },
        isActive: true,
        ownerId: userId,
      },
      create: {
        channel: "instagram",
        externalAccountId: me.id,
        title: me.username,
        tokenEnc,
        tokenExpiresAt: expiresAt,
        meta: { accountType: me.account_type, scopes: shortLived.permissions ?? [] },
        isActive: true,
        ownerId: userId,
      },
    });

    // ── 6. Подписываемся на webhook (best-effort, не критично если упадёт) ─
    try {
      await subscribeToMessagingWebhook(me.id, longLived.access_token);
    } catch (e) {
      console.warn("[ig-oauth] webhook subscription failed:", e);
      // Не редиректим в ошибку — пользователь сможет переподключить позже.
    }

    return Response.redirect(
      `${APP_URL}/admin/bots?ig_connected=${encodeURIComponent(me.username)}&botId=${bot.id}`,
      302
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ig-oauth] callback failed:", msg);
    return Response.redirect(
      `${APP_URL}/admin/bots?ig_error=${encodeURIComponent(msg.slice(0, 200))}`,
      302
    );
  }
}
