/**
 * app/api/admin/messaging/bots/[id]/overview/route.ts
 *
 * Сводная статистика по одному MAX/мессенджер-боту для страницы «Обзор»
 * (/admin/messaging/[botId]). Аналог /admin/tg/bots/[id]/events у TG.
 *
 * Возвращает:
 *   subscribers — total / activeWeek / newDay / blocked
 *   messages    — sentDay / receivedDay (за последние 24 часа)
 *   topTags     — топ-10 тегов подписчиков
 *
 * Только админ.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { UserRole } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    req,
    async () => {
      const { id: botId } = await params;

      // Сначала проверяем существование — иначе фронт будет крутить
      // загрузку до бесконечности при битом botId.
      const bot = await db.messagingBot.findUnique({
        where: { id: botId },
        select: { id: true },
      });
      if (!bot) {
        return NextResponse.json(
          { success: false, error: "Бот не найден" },
          { status: 404 }
        );
      }

      const now = Date.now();
      const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
      const dayAgo = new Date(now - 24 * 60 * 60 * 1000);

      // ── Подсчёт подписчиков ────────────────────────────────────────────
      // total      — все
      // activeWeek — последняя активность в последние 7 дней. У
      //              MessagingSubscriber это lastInboundAt (последнее
      //              входящее) или lastSeenAt (последняя «связь»).
      //              Берём OR — кто-то из двух должен попасть в окно.
      // newDay     — subscribedAt в последние 24 часа.
      // takeover   — диалоги, взятые оператором (операторская нагрузка).
      const [total, activeWeek, newDay, takeover] = await Promise.all([
        db.messagingSubscriber.count({ where: { botId } }),
        db.messagingSubscriber.count({
          where: {
            botId,
            OR: [
              { lastInboundAt: { gte: weekAgo } },
              { lastSeenAt: { gte: weekAgo } },
            ],
          },
        }),
        db.messagingSubscriber.count({
          where: { botId, subscribedAt: { gte: dayAgo } },
        }),
        db.messagingSubscriber.count({
          where: { botId, operatorTakeoverAt: { not: null } },
        }),
      ]);

      // ── Сообщения за сутки ─────────────────────────────────────────────
      // direction: "in" — от пользователя, "out" — от бота.
      // MessagingMessage хранит направление в поле direction.
      const [receivedDay, sentDay] = await Promise.all([
        db.messagingMessage.count({
          where: { botId, direction: "in", createdAt: { gte: dayAgo } },
        }),
        db.messagingMessage.count({
          where: { botId, direction: "out", createdAt: { gte: dayAgo } },
        }),
      ]);

      // ── Топ-теги. Считаем сами: tags — массив строк в схеме. ──────────
      const subscribersWithTags = await db.messagingSubscriber.findMany({
        where: { botId, tags: { isEmpty: false } },
        select: { tags: true },
        take: 5000, // защита от out-of-memory при огромной базе
      });
      const tagCounts = new Map<string, number>();
      for (const s of subscribersWithTags) {
        for (const t of s.tags) {
          tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
        }
      }
      const topTags = Array.from(tagCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([tag, count]) => ({ tag, count }));

      return NextResponse.json({
        success: true,
        data: {
          subscribers: { total, activeWeek, newDay, takeover },
          messages: { sentDay, receivedDay },
          topTags,
        },
      });
    },
    { roles: [UserRole.admin] }
  );
}
