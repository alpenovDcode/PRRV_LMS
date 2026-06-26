import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { logAction } from "@/lib/audit";
import { validateFromEmail } from "@/lib/email/security/from-email";

/**
 * GET /api/admin/marketing/campaigns/[id]
 *
 * Полная карточка кампании: связанные template/segment + 50 последних
 * EmailDeliveryJob для таблицы получателей.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    request,
    async () => {
      const { id } = await params;
      const campaign = await db.emailCampaign.findUnique({
        where: { id },
        include: {
          segment: { select: { id: true, name: true, contactCount: true } },
          template: { select: { id: true, name: true, subject: true } },
          deliveryJobs: {
            orderBy: { updatedAt: "desc" },
            take: 50,
            select: {
              id: true,
              email: true,
              status: true,
              attemptCount: true,
              nextAttemptAt: true,
              lastError: true,
              sentAt: true,
              providerMessageId: true,
              user: { select: { id: true, fullName: true } },
            },
          },
        },
      });

      if (!campaign) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: { code: "NOT_FOUND", message: "Кампания не найдена" } },
          { status: 404 }
        );
      }

      return NextResponse.json<ApiResponse>({ success: true, data: campaign });
    },
    { roles: [UserRole.admin] }
  );
}

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  subject: z.string().min(1).max(500).optional(),
  preheader: z.string().max(500).nullable().optional(),
  fromName: z.string().max(200).optional(),
  fromEmail: z.string().email().optional(),
  templateId: z.string().uuid().nullable().optional(),
  segmentId: z.string().uuid().nullable().optional(),
});

/**
 * PATCH /api/admin/marketing/campaigns/[id]
 *
 * Обновляет draft. Кампанию которая уже отправляется/отправлена менять нельзя.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    request,
    async (req) => {
      const { id } = await params;
      const body = await request.json();
      const data = patchSchema.parse(body);

      const existing = await db.emailCampaign.findUnique({
        where: { id },
        select: { status: true },
      });
      if (!existing) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: { code: "NOT_FOUND", message: "Кампания не найдена" } },
          { status: 404 }
        );
      }
      if (!["draft", "scheduled"].includes(existing.status)) {
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INVALID_STATE",
              message: "Можно редактировать только черновики или запланированные кампании",
            },
          },
          { status: 409 }
        );
      }

      if (data.fromEmail !== undefined) {
        const fromCheck = validateFromEmail(data.fromEmail);
        if (!fromCheck.ok) {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: { code: "INVALID_FROM_EMAIL", message: fromCheck.reason ?? "Невалидный fromEmail" },
            },
            { status: 400 }
          );
        }
      }

      const updateData: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(data)) {
        if (v !== undefined) updateData[k] = v;
      }

      const campaign = await db.emailCampaign.update({
        where: { id },
        data: updateData,
      });

      await logAction(req.user!.userId, "EMAIL_CAMPAIGN_UPDATE", "EmailCampaign", id, {
        name: campaign.name,
      });

      return NextResponse.json<ApiResponse>({ success: true, data: campaign });
    },
    { roles: [UserRole.admin] }
  );
}

/**
 * DELETE /api/admin/marketing/campaigns/[id]
 *
 * Удаляет кампанию. EmailDeliveryJob удалятся каскадом (FK Cascade).
 * Завершённые кампании удалять нельзя — только архивировать (status="cancelled").
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    request,
    async (req) => {
      const { id } = await params;
      const existing = await db.emailCampaign.findUnique({
        where: { id },
        select: { status: true, name: true },
      });
      if (!existing) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: { code: "NOT_FOUND", message: "Кампания не найдена" } },
          { status: 404 }
        );
      }
      if (existing.status === "sending") {
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INVALID_STATE",
              message: "Сначала остановите отправку через /cancel",
            },
          },
          { status: 409 }
        );
      }

      await db.emailCampaign.delete({ where: { id } });
      await logAction(req.user!.userId, "EMAIL_CAMPAIGN_DELETE", "EmailCampaign", id, {
        name: existing.name,
      });

      return NextResponse.json<ApiResponse>({ success: true, data: { id } });
    },
    { roles: [UserRole.admin] }
  );
}
