import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { logAction } from "@/lib/audit";
import { validateFromEmail } from "@/lib/email/security/from-email";
import { validateAbTestConfig, type AbTestConfig } from "@/lib/email/queue/ab-test";

/**
 * GET /api/admin/marketing/campaigns
 *
 * Список кампаний с метриками. Query:
 *   status — фильтр по статусу (csv)
 *   page, limit
 */
export async function GET(request: NextRequest) {
  return withAuth(
    request,
    async () => {
      const { searchParams } = new URL(request.url);
      const status = (searchParams.get("status") || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
      const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));

      const where = status.length > 0 ? { status: { in: status } } : undefined;

      const [items, total] = await Promise.all([
        db.emailCampaign.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: limit,
          skip: (page - 1) * limit,
          select: {
            id: true,
            name: true,
            subject: true,
            status: true,
            scheduledAt: true,
            startedAt: true,
            finishedAt: true,
            stats: true,
            createdAt: true,
            updatedAt: true,
            segment: { select: { id: true, name: true } },
            template: { select: { id: true, name: true } },
          },
        }),
        db.emailCampaign.count({ where }),
      ]);

      return NextResponse.json<ApiResponse>({
        success: true,
        data: { items, total, page, limit },
      });
    },
    { roles: [UserRole.admin] }
  );
}

const abTestSchema = z.object({
  enabled: z.boolean(),
  variants: z
    .array(
      z.object({
        subject: z.string().min(1).max(500),
        fromName: z.string().max(200).optional(),
        sharePercent: z.number().int().min(1).max(50),
      })
    )
    .min(2)
    .max(4),
  winnerMetric: z.enum(["opened", "clicked"]),
  winnerAfterHours: z.number().int().min(1).max(168),
});

const createSchema = z.object({
  name: z.string().min(1).max(200),
  subject: z.string().min(1).max(500),
  preheader: z.string().max(500).optional(),
  fromName: z.string().max(200).optional(),
  fromEmail: z.string().email().optional(),
  templateId: z.string().uuid().optional(),
  segmentId: z.string().uuid().optional(),
  abTest: abTestSchema.optional(),
});

/**
 * POST /api/admin/marketing/campaigns
 *
 * Создаёт draft-кампанию. Все поля кроме name и subject — опциональны и
 * заполняются на этапах wizard.
 */
export async function POST(request: NextRequest) {
  return withAuth(
    request,
    async (req) => {
      const body = await request.json();
      const data = createSchema.parse(body);

      const fromEmail =
        data.fromEmail ??
        process.env.EMAIL_MARKETING_FROM_EMAIL ??
        process.env.SMTP_USER ??
        "noreply@prrv.tech";

      const fromCheck = validateFromEmail(fromEmail);
      if (!fromCheck.ok) {
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: { code: "INVALID_FROM_EMAIL", message: fromCheck.reason ?? "Невалидный fromEmail" },
          },
          { status: 400 }
        );
      }

      if (data.abTest?.enabled) {
        const abCheck = validateAbTestConfig(data.abTest as AbTestConfig);
        if (!abCheck.ok) {
          return NextResponse.json<ApiResponse>(
            { success: false, error: { code: "INVALID_AB_TEST", message: abCheck.reason } },
            { status: 400 }
          );
        }
      }

      const campaign = await db.emailCampaign.create({
        data: {
          name: data.name,
          subject: data.subject,
          preheader: data.preheader ?? null,
          fromName: data.fromName ?? process.env.EMAIL_MARKETING_FROM_NAME ?? "Прорыв",
          fromEmail,
          templateId: data.templateId ?? null,
          segmentId: data.segmentId ?? null,
          status: "draft",
          createdBy: req.user!.userId,
          abTest: data.abTest ?? undefined,
        },
      });

      await logAction(req.user!.userId, "EMAIL_CAMPAIGN_CREATE", "EmailCampaign", campaign.id, {
        name: campaign.name,
      });

      return NextResponse.json<ApiResponse>({ success: true, data: campaign });
    },
    { roles: [UserRole.admin] }
  );
}
