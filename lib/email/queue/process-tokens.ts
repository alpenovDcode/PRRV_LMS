import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { generateUnsubscribeToken } from "@/lib/email/security/unsubscribe-token";
import {
  compileSegmentFilters,
  parseSegmentFilters,
} from "@/lib/email/segments/compile-filters";

/**
 * Фоновый генератор unsubscribeToken'ов для запланированных и активных
 * кампаний. Вызывается из cron-tick (каждые 10 сек).
 *
 * Контекст: раньше /api/admin/marketing/campaigns/[id]/send делал генерацию
 * 70K UPDATE'ов синхронно в HTTP-обработчике — таймаут nginx на больших
 * базах. Теперь /send только ставит `tokensReady=false`, а cron-tick дожимает.
 *
 * Алгоритм:
 *   1. Берём ОДНУ кампанию с tokensReady=false и status в (scheduled|sending).
 *   2. Компилируем фильтры её сегмента + AND user.unsubscribeToken IS NULL.
 *   3. До PER_TICK_LIMIT пользователей этой кампании получают токен.
 *   4. Если ничего не осталось — ставим tokensReady=true.
 *
 * Round-robin между кампаниями получается естественно: каждый tick выбираем
 * самую старую с не-готовыми токенами. На 70K-базе займёт ~140 tick'ов
 * (~25 мин) если PER_TICK_LIMIT=500. Это приемлемо, потому что enqueue
 * стартует только после tokensReady=true.
 */

const PER_TICK_LIMIT = 500;

export interface TokensResult {
  processed: number;
  campaignsCompleted: number;
}

export async function processTokensGeneration(): Promise<TokensResult> {
  const campaign = await db.emailCampaign.findFirst({
    where: {
      tokensReady: false,
      status: { in: ["scheduled", "sending"] },
      segmentId: { not: null },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, segmentId: true },
  });

  if (!campaign?.segmentId) {
    return { processed: 0, campaignsCompleted: 0 };
  }

  const segment = await db.emailSegment.findUnique({
    where: { id: campaign.segmentId },
    select: { filters: true },
  });
  if (!segment) {
    // Сегмент удалили — нечего фильтровать, помечаем готовым и идём дальше.
    await db.emailCampaign.update({
      where: { id: campaign.id },
      data: { tokensReady: true },
    });
    return { processed: 0, campaignsCompleted: 1 };
  }

  const segmentWhere = compileSegmentFilters(parseSegmentFilters(segment.filters));
  const where: Prisma.UserWhereInput = {
    AND: [segmentWhere, { unsubscribeToken: null }],
  };

  const users = await db.user.findMany({
    where,
    orderBy: { id: "asc" },
    take: PER_TICK_LIMIT,
    select: { id: true },
  });

  if (users.length === 0) {
    // Все токены проставлены — финализируем флаг.
    await db.emailCampaign.update({
      where: { id: campaign.id },
      data: { tokensReady: true },
    });
    return { processed: 0, campaignsCompleted: 1 };
  }

  // Update по одному — Prisma не поддерживает разные значения в updateMany,
  // а нам нужны уникальные токены. Race-safe: если параллельный процесс
  // одновременно проставит токен этому же юзеру (другая кампания), второй
  // update просто перепишет, оба токена валидны и хранятся в одном поле
  // — последний победит. Это норма, потому что unsubscribe-токен один
  // на юзера, не на кампанию.
  for (const u of users) {
    try {
      await db.user.update({
        where: { id: u.id },
        data: { unsubscribeToken: generateUnsubscribeToken() },
      });
    } catch (e) {
      // Возможна редкая P2002 collision при параллельных insert одного и того
      // же токена (вероятность 1/2^256) — просто пропускаем и продолжаем.
      console.warn(`[process-tokens] failed to set token for user ${u.id}:`, e);
    }
  }

  return { processed: users.length, campaignsCompleted: 0 };
}
