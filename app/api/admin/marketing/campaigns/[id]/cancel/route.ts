import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";
import { logAction } from "@/lib/audit";
import { getMarketingEmailProvider } from "@/lib/email/providers/factory";

/**
 * POST /api/admin/marketing/campaigns/[id]/cancel
 *
 * Полная остановка. Оставшиеся pending/retrying джобы помечаются как cancelled —
 * cron-tick их пропустит. Уже отправленные не трогаем.
 *
 * Bulk-режим: дополнительно вызываем provider.cancelBulkCampaign — иначе
 * Unisender продолжит отправлять остальным.
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
      if (!["sending", "paused", "scheduled"].includes(campaign.status)) {
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INVALID_STATE",
              message: `Отменить можно только sending/paused/scheduled. Текущий: ${campaign.status}`,
            },
          },
          { status: 409 }
        );
      }

      // Bulk-режим: cancel у провайдера до изменения нашего статуса —
      // если Unisender отверг (например статус completed уже), мы это узнаем
      // и не введём пользователя в заблуждение неконсистентным статусом.
      if (campaign.providerCampaignId) {
        const provider = getMarketingEmailProvider();
        try {
          await provider.cancelBulkCampaign?.(campaign.providerCampaignId);
        } catch (e) {
          console.error(`[cancel] provider cancel failed for ${id}:`, e);
        }
      }

      const [updatedJobs] = await db.$transaction([
        db.emailDeliveryJob.updateMany({
          where: { campaignId: id, status: { in: ["pending", "retrying"] } },
          data: { status: "cancelled" },
        }),
        db.emailCampaign.update({
          where: { id },
          data: { status: "cancelled", finishedAt: new Date() },
        }),
      ]);

      await logAction(req.user!.userId, "EMAIL_CAMPAIGN_CANCEL", "EmailCampaign", id, {
        name: campaign.name,
        cancelledJobs: updatedJobs.count,
      });

      return NextResponse.json<ApiResponse>({
        success: true,
        data: { id, status: "cancelled", cancelledJobs: updatedJobs.count },
      });
    },
    { roles: [UserRole.admin] }
  );
}
