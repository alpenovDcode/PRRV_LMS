import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";

/**
 * GET /api/admin/marketing/contacts/[id]
 *
 * Детали одного контакта + история взаимодействий (EmailEvent) +
 * последние 20 BroadcastRecipient записей. Используется на странице
 * /admin/marketing/contacts/[id] и во вкладке «Email» карточки пользователя.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    request,
    async () => {
      const { id } = await params;

      const user = await db.user.findUnique({
        where: { id },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          tariff: true,
          track: true,
          createdAt: true,
          lastActiveAt: true,
          isBlocked: true,
          // Маркетинговые поля
          externalContactId: true,
          contactSyncedAt: true,
          emailValidated: true,
          marketingOptOut: true,
          unsubscribedAt: true,
          emailTags: true,
        },
      });

      if (!user) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: { code: "NOT_FOUND", message: "Контакт не найден" } },
          { status: 404 }
        );
      }

      // История email-событий (последние 100).
      const events = await db.emailEvent.findMany({
        where: { userId: id },
        select: {
          id: true,
          type: true,
          url: true,
          campaignId: true,
          occurredAt: true,
          campaign: { select: { id: true, name: true, subject: true } },
        },
        orderBy: { occurredAt: "desc" },
        take: 100,
      });

      // Старые BroadcastRecipient записи (LMS-уведомления через текущий broadcast).
      const broadcastRecipients = await db.broadcastRecipient.findMany({
        where: { userId: id },
        select: {
          id: true,
          email: true,
          emailStatus: true,
          lmsStatus: true,
          deliveredAt: true,
          openedAt: true,
          openCount: true,
          clickedAt: true,
          clickCount: true,
          bouncedAt: true,
          unsubscribedAt: true,
          errorMessage: true,
          createdAt: true,
          broadcast: { select: { id: true, title: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      });

      // Агрегированные метрики (быстрый count в БД, не выгружаем events лишний раз).
      const [totalSent, totalOpened, totalClicked, totalBounced] = await Promise.all([
        db.emailEvent.count({ where: { userId: id, type: "sent" } }),
        db.emailEvent.count({ where: { userId: id, type: "opened" } }),
        db.emailEvent.count({ where: { userId: id, type: "clicked" } }),
        db.emailEvent.count({ where: { userId: id, type: "bounced" } }),
      ]);

      return NextResponse.json<ApiResponse>({
        success: true,
        data: {
          user,
          stats: {
            sent: totalSent,
            opened: totalOpened,
            clicked: totalClicked,
            bounced: totalBounced,
          },
          events,
          broadcastRecipients,
        },
      });
    },
    { roles: [UserRole.admin] }
  );
}
