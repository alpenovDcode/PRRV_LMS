/**
 * app/api/admin/messaging/bots/[id]/subscribers/route.ts
 *
 * Список подписчиков MAX/мессенджер-бота для страницы «Подписчики»
 * (chat-style раздел в /admin/messaging/[id]/subscribers). Аналог
 * /admin/tg/bots/[id]/subscribers, но проще: не загружаем массивы
 * lastMessage сразу — это делается следом отдельным fetch по выбранному
 * подписчику (так UI остаётся лёгким даже на 50k базе).
 *
 * Query:
 *   q     — поиск по firstName / lastName / username / externalUserId
 *           / lmsUser.email (case-insensitive contains).
 *   tag   — фильтр по точному совпадению одного из тегов.
 *   page  — 1-based, default 1.
 *   pageSize — 10..200, default 50.
 *
 * Ответ:
 *   items[]       — id, name, externalUserId, tags, lastSeenAt, lastInboundAt,
 *                   subscribedAt, operatorTakeoverAt, lmsUser?
 *   total         — общее количество под фильтр (для пагинации)
 *   tagCloud      — топ-20 тегов из текущей выборки, для UI-фильтра
 */

import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-middleware";
import { UserRole } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> }
) {
  const params = await paramsP;
  return withAuth(
    request,
    async () => {
      const url = new URL(request.url);
      const q = (url.searchParams.get("q") ?? "").trim();
      const tag = (url.searchParams.get("tag") ?? "").trim();
      const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
      const pageSize = Math.min(
        200,
        Math.max(10, parseInt(url.searchParams.get("pageSize") ?? "50", 10) || 50)
      );

      const where: Prisma.MessagingSubscriberWhereInput = {
        botId: params.id,
        ...(tag ? { tags: { has: tag } } : {}),
        ...(q
          ? {
              OR: [
                { firstName: { contains: q, mode: "insensitive" } },
                { lastName: { contains: q, mode: "insensitive" } },
                { username: { contains: q, mode: "insensitive" } },
                { externalUserId: { contains: q, mode: "insensitive" } },
                {
                  lmsUser: {
                    OR: [
                      { email: { contains: q, mode: "insensitive" } },
                      { fullName: { contains: q, mode: "insensitive" } },
                    ],
                  },
                },
              ],
            }
          : {}),
      };

      const [total, rows] = await Promise.all([
        db.messagingSubscriber.count({ where }),
        db.messagingSubscriber.findMany({
          where,
          orderBy: [
            // Сортируем тех, кто последним написал — сверху. Если активности
            // нет — по subscribedAt.
            { lastInboundAt: { sort: "desc", nulls: "last" } },
            { subscribedAt: "desc" },
          ],
          skip: (page - 1) * pageSize,
          take: pageSize,
          select: {
            id: true,
            externalUserId: true,
            firstName: true,
            lastName: true,
            username: true,
            tags: true,
            subscribedAt: true,
            lastSeenAt: true,
            lastInboundAt: true,
            operatorTakeoverAt: true,
            lmsUser: { select: { id: true, email: true, fullName: true } },
          },
        }),
      ]);

      // tagCloud — топ-20 тегов по этой выборке. Считаем сами (Postgres
      // String[] напрямую не группируется через Prisma).
      const tagCounts = new Map<string, number>();
      for (const r of rows) {
        for (const t of r.tags) {
          tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
        }
      }
      const tagCloud = Array.from(tagCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([t, count]) => ({ tag: t, count }));

      const items = rows.map((s) => ({
        id: s.id,
        externalUserId: s.externalUserId,
        name:
          [s.firstName, s.lastName].filter(Boolean).join(" ") ||
          s.username ||
          s.externalUserId,
        firstName: s.firstName,
        lastName: s.lastName,
        username: s.username,
        tags: s.tags,
        subscribedAt: s.subscribedAt.toISOString(),
        lastSeenAt: s.lastSeenAt?.toISOString() ?? null,
        lastInboundAt: s.lastInboundAt?.toISOString() ?? null,
        operatorTakeoverAt: s.operatorTakeoverAt?.toISOString() ?? null,
        lmsUser: s.lmsUser
          ? { id: s.lmsUser.id, email: s.lmsUser.email, fullName: s.lmsUser.fullName }
          : null,
      }));

      return NextResponse.json({
        success: true,
        data: {
          items,
          total,
          page,
          pageSize,
          pages: Math.ceil(total / pageSize),
          tagCloud,
        },
      });
    },
    { roles: [UserRole.admin] }
  );
}
