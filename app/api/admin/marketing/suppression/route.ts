import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";

/**
 * GET /api/admin/marketing/suppression
 *
 * Список пользователей с marketingOptOut=true. Для каждого определяем причину
 * по последнему EmailEvent типов unsubscribed / bounced / spam:
 *   - unsubscribed → "Отписался"
 *   - bounced     → "Hard bounce (адрес мёртв)"
 *   - spam        → "Жалоба на спам"
 *   - не нашлось — "Отписан админом вручную"
 *
 * Также возвращает агрегаты для шапки страницы:
 *   { total, byReason: { unsubscribed, bounced, spam, manual } }
 */
export async function GET(request: NextRequest) {
  return withAuth(
    request,
    async () => {
      const { searchParams } = new URL(request.url);
      const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
      const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "30", 10)));

      const [items, total] = await Promise.all([
        db.user.findMany({
          where: { marketingOptOut: true },
          select: {
            id: true,
            email: true,
            fullName: true,
            unsubscribedAt: true,
            createdAt: true,
            emailEvents: {
              where: { type: { in: ["unsubscribed", "bounced", "spam"] } },
              orderBy: { occurredAt: "desc" },
              take: 1,
              select: { type: true, occurredAt: true, metadata: true },
            },
          },
          orderBy: { unsubscribedAt: { sort: "desc", nulls: "last" } },
          take: limit,
          skip: (page - 1) * limit,
        }),
        db.user.count({ where: { marketingOptOut: true } }),
      ]);

      // Агрегаты по причине — из последнего EmailEvent каждого юзера.
      // Это приблизительно: считаем только по выборке для производительности
      // (точные числа можно посчитать отдельным групповым query, но это +RTT).
      const [agg] = await Promise.all([
        Promise.all([
          db.emailEvent.count({ where: { type: "unsubscribed", userId: { not: null } } }),
          db.emailEvent.count({ where: { type: "bounced", userId: { not: null } } }),
          db.emailEvent.count({ where: { type: "spam", userId: { not: null } } }),
        ]),
      ]);

      const [unsubscribed, bounced, spam] = agg;

      return NextResponse.json<ApiResponse>({
        success: true,
        data: {
          items: items.map((u) => {
            const lastEvent = u.emailEvents[0];
            let reason: "unsubscribed" | "bounced" | "spam" | "manual" = "manual";
            if (lastEvent) reason = lastEvent.type as typeof reason;
            return {
              id: u.id,
              email: u.email,
              fullName: u.fullName,
              unsubscribedAt: u.unsubscribedAt,
              reason,
              lastEventAt: lastEvent?.occurredAt ?? null,
            };
          }),
          total,
          page,
          limit,
          aggregates: {
            unsubscribed,
            bounced,
            spam,
          },
        },
      });
    },
    { roles: [UserRole.admin] }
  );
}
