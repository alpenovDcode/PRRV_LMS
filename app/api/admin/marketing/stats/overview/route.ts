import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";

/**
 * GET /api/admin/marketing/stats/overview
 *
 * Базовые счётчики для главной страницы /admin/marketing.
 * Расширенные метрики (доставлено, OR, CTR, отписалось) добавятся в Спринте 5.
 */
export async function GET(request: NextRequest) {
  return withAuth(
    request,
    async () => {
      const [
        totalContacts,
        subscribedContacts,
        totalCampaigns,
        totalSegments,
        totalTemplates,
        totalAutomations,
      ] = await Promise.all([
        db.user.count(),
        db.user.count({ where: { marketingOptOut: false } }),
        db.emailCampaign.count(),
        db.emailSegment.count(),
        db.emailVisualTemplate.count({ where: { isArchived: false } }),
        db.emailAutomation.count({ where: { isActive: true } }),
      ]);

      return NextResponse.json<ApiResponse>({
        success: true,
        data: {
          totalContacts,
          subscribedContacts,
          totalCampaigns,
          totalSegments,
          totalTemplates,
          totalAutomations,
        },
      });
    },
    { roles: [UserRole.admin] }
  );
}
