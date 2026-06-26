import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";
import { logAction } from "@/lib/audit";

/**
 * POST /api/admin/marketing/campaigns/[id]/resume
 *
 * Возвращает paused-кампанию обратно в sending. Оставшиеся в очереди джобы снова
 * начнут забираться cron-tick'ом.
 *
 * Bulk-режим (Unisender): pause фактически cancel'нул кампанию у провайдера
 * (Unisender не умеет pause). Для resume надо пересоздать через createCampaign —
 * сбрасываем providerCampaignId и enqueueComplete, чтобы processPendingEnqueues
 * подхватил кампанию и сделал bulk-run заново.
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
      if (campaign.status !== "paused") {
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INVALID_STATE",
              message: `Возобновить можно только paused. Текущий: ${campaign.status}`,
            },
          },
          { status: 409 }
        );
      }

      const data: Record<string, unknown> = { status: "sending" };
      if (campaign.providerCampaignId) {
        // Bulk-режим: pause у Unisender'a фактически cancel — пересоздаём.
        data.providerCampaignId = null;
        data.enqueueComplete = false;
      }

      await db.emailCampaign.update({ where: { id }, data });
      await logAction(req.user!.userId, "EMAIL_CAMPAIGN_RESUME", "EmailCampaign", id, {
        name: campaign.name,
        recreatedAtProvider: !!campaign.providerCampaignId,
      });

      return NextResponse.json<ApiResponse>({ success: true, data: { id, status: "sending" } });
    },
    { roles: [UserRole.admin] }
  );
}
