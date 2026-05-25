import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/messaging/encryption";
import { refreshLongLivedToken } from "@/lib/messaging/instagram/oauth";

const CRON_SECRET = process.env.TG_CRON_SECRET || "";

/**
 * POST /api/tg-cron/refresh-ig-tokens
 *
 * Продлевает long-lived Instagram-токены. Meta даёт 60 дней TTL.
 * Cron должен запускаться раз в день (или раз в неделю). Refresh-окно:
 * токены, которые истекают в ближайшие 7 дней.
 *
 * Заодно очищаем просроченные OAuth state записи.
 */
export async function POST(req: NextRequest) {
  const secret =
    req.headers.get("x-cron-secret") ||
    req.nextUrl.searchParams.get("secret") ||
    "";
  if (CRON_SECRET && secret !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Refresh tokens ───────────────────────────────────────────────────────
  const refreshThreshold = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const bots = await db.messagingBot.findMany({
    where: {
      channel: "instagram",
      isActive: true,
      tokenExpiresAt: { lte: refreshThreshold },
    },
  });

  let refreshed = 0;
  let failed = 0;

  for (const bot of bots) {
    try {
      const refreshedToken = await refreshLongLivedToken(decrypt(bot.tokenEnc));
      await db.messagingBot.update({
        where: { id: bot.id },
        data: {
          tokenEnc: encrypt(refreshedToken.access_token),
          tokenExpiresAt: new Date(Date.now() + refreshedToken.expires_in * 1000),
        },
      });
      refreshed++;
    } catch (e) {
      console.error(`[refresh-ig-tokens] bot ${bot.id} (${bot.title}) failed:`, e);
      failed++;
    }
  }

  // ── Cleanup просроченных OAuth states ───────────────────────────────────
  const purged = await db.messagingOAuthState.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });

  return NextResponse.json({
    ok: true,
    refreshed,
    failed,
    purgedOauthStates: purged.count,
  });
}
