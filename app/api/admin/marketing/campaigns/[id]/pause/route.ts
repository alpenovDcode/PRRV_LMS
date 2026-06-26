import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";
import { logAction } from "@/lib/audit";
import { getMarketingEmailProvider } from "@/lib/email/providers/factory";

/**
 * POST /api/admin/marketing/campaigns/[id]/pause
 *
 * Ставит кампанию на паузу. Cron-tick фильтрует jobs WHERE campaign.status="sending",
 * так что после смены статуса воркер автоматически перестанет шлифовать оставшихся.
 * Уже отправленные письма не отменяются (физически — они уже у получателя).
 *
 * Bulk-режим (Unisender createCampaign): дополнительно дёргаем provider.
 * pauseBulkCampaign. У Unisender pause не поддерживается — фактически это
 * cancel в их системе (см. unisender.ts.pauseBulkCampaign). Это нормально:
 * resume отдельной кампании на их стороне нельзя, мы создадим новую
 * createCampaign при ресуме (логика в resume/route.ts).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    request,
    async (req) => {
      const { id } = await params;
      const campaign = await db.emailCampaign.findUnique({
        where: { id },
        select: { status: true, name: true, providerCampaignId: true },
      });
      if (!campaign) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: { code: "NOT_FOUND", message: "Кампания не найдена" } },
          { status: 404 }
        );
      }
      if (campaign.status !== "sending") {
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INVALID_STATE",
              message: `Поставить на паузу можно только sending. Текущий: ${campaign.status}`,
            },
          },
          { status: 409 }
        );
      }

      // Bulk-режим: дёргаем провайдер. Не блокируем UI — если у Unisender'a
      // ошибка, состояние у нас всё равно меняется (cron не будет polling'ом
      // обновлять статистику и pending останется на нашей стороне корректным).
      if (campaign.providerCampaignId) {
        const provider = getMarketingEmailProvider();
        try {
          await provider.pauseBulkCampaign?.(campaign.providerCampaignId);
        } catch (e) {
          console.error(`[pause] provider pause failed for ${id}:`, e);
        }
      }

      await db.emailCampaign.update({ where: { id }, data: { status: "paused" } });
      await logAction(req.user!.userId, "EMAIL_CAMPAIGN_PAUSE", "EmailCampaign", id, {
        name: campaign.name,
      });

      return NextResponse.json<ApiResponse>({ success: true, data: { id, status: "paused" } });
    },
    { roles: [UserRole.admin] }
  );
}
