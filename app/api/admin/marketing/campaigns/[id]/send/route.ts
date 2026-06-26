import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { logAction } from "@/lib/audit";

/**
 * POST /api/admin/marketing/campaigns/[id]/send
 *
 * Запускает кампанию.
 *
 * Body:
 *   scheduledAt (optional) — если указан, кампания получает статус "scheduled"
 *     и стартует автоматически когда cron-tick поймает scheduledAt <= now.
 *     Без поля кампания стартует немедленно: status="sending".
 *
 * ВАЖНО: эта ручка НЕ генерирует unsubscribeToken'ы и НЕ создаёт
 * EmailDeliveryJob синхронно. Раньше /send делал 70K UPDATE в одном HTTP-
 * обработчике → nginx таймаут на большой базе.
 *
 * Теперь ответственность — только проставить статус и снять флаги:
 *   tokensReady=false → cron-tick.processTokensGeneration сделает токены
 *   enqueueComplete=false → cron-tick.processPendingEnqueues создаст jobs
 *
 * Дальше processDueDeliveryJobs / processFinishedCampaigns живут как прежде.
 */
const sendSchema = z.object({
  scheduledAt: z.string().datetime().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    request,
    async (req) => {
      const { id } = await params;
      const body = await request.json().catch(() => ({}));
      const { scheduledAt } = sendSchema.parse(body);

      const campaign = await db.emailCampaign.findUnique({
        where: { id },
        select: { status: true, templateId: true, segmentId: true, name: true },
      });
      if (!campaign) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: { code: "NOT_FOUND", message: "Кампания не найдена" } },
          { status: 404 }
        );
      }
      if (campaign.status !== "draft" && campaign.status !== "scheduled") {
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INVALID_STATE",
              message: `Кампанию в статусе ${campaign.status} нельзя отправить ещё раз`,
            },
          },
          { status: 409 }
        );
      }
      if (!campaign.templateId) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: { code: "MISSING_TEMPLATE", message: "Выберите шаблон" } },
          { status: 400 }
        );
      }
      if (!campaign.segmentId) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: { code: "MISSING_SEGMENT", message: "Выберите сегмент" } },
          { status: 400 }
        );
      }

      if (scheduledAt) {
        const date = new Date(scheduledAt);
        if (Number.isNaN(date.getTime())) {
          return NextResponse.json<ApiResponse>(
            { success: false, error: { code: "VALIDATION_ERROR", message: "Невалидная дата" } },
            { status: 400 }
          );
        }
        await db.emailCampaign.update({
          where: { id },
          data: {
            status: "scheduled",
            scheduledAt: date,
            tokensReady: false,
            enqueueComplete: false,
          },
        });
        await logAction(req.user!.userId, "EMAIL_CAMPAIGN_SCHEDULE", "EmailCampaign", id, {
          name: campaign.name,
          scheduledAt: date.toISOString(),
        });
        return NextResponse.json<ApiResponse>({
          success: true,
          data: { id, status: "scheduled", scheduledAt: date.toISOString() },
        });
      }

      // Немедленный старт. Cron-tick (10с) подхватит и сделает:
      //   1. processTokensGeneration: проставит unsubscribeToken получателям
      //   2. processPendingEnqueues: создаст EmailDeliveryJob
      //   3. processDueDeliveryJobs: разошлёт батч (100 за тик)
      await db.emailCampaign.update({
        where: { id },
        data: {
          status: "sending",
          startedAt: new Date(),
          tokensReady: false,
          enqueueComplete: false,
        },
      });

      await logAction(req.user!.userId, "EMAIL_CAMPAIGN_SEND", "EmailCampaign", id, {
        name: campaign.name,
      });

      return NextResponse.json<ApiResponse>({
        success: true,
        data: {
          id,
          status: "sending",
          message:
            "Кампания принята. Фоновая отправка начнётся в течение 10 секунд (cron-tick). " +
            "Следите за прогрессом в карточке кампании.",
        },
      });
    },
    { roles: [UserRole.admin] }
  );
}
