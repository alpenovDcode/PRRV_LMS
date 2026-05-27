import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { UserRole } from "@prisma/client";
import { z } from "zod";

const fieldMapping = z.object({
  lmsVar: z.string().min(1),
  bitrixField: z.string().min(1),
});

const tagTrigger = z.object({
  tag: z.string().min(1),
  stageId: z.string().min(1),
});

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  webhookUrl: z.string().nullish(),
  funnelId: z.string().optional(),
  defaultStageId: z.string().optional(),
  contactMappings: z.array(fieldMapping).optional(),
  dealMappings: z.array(fieldMapping).optional(),
  tagTriggers: z.array(tagTrigger).optional(),
});

/**
 * GET /api/admin/messaging/bots/[id]/bitrix
 * PATCH /api/admin/messaging/bots/[id]/bitrix
 *
 * Конфиг Bitrix24 синхронизации для messaging-бота.
 * Upsert на PATCH.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    req,
    async () => {
      const { id } = await params;
      const config = await db.messagingBitrixConfig.findUnique({ where: { botId: id } });
      return NextResponse.json({
        success: true,
        data: config ?? {
          botId: id,
          enabled: false,
          webhookUrl: null,
          funnelId: "0",
          defaultStageId: "",
          contactMappings: [],
          dealMappings: [],
          tagTriggers: [],
        },
      });
    },
    { roles: [UserRole.admin] }
  );
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    req,
    async () => {
      const { id } = await params;
      const body = await req.json().catch(() => null);
      const parsed = patchSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, error: "Невалидные данные" },
          { status: 400 }
        );
      }

      const data = parsed.data;
      const config = await db.messagingBitrixConfig.upsert({
        where: { botId: id },
        create: {
          botId: id,
          enabled: data.enabled ?? false,
          webhookUrl: data.webhookUrl ?? null,
          funnelId: data.funnelId ?? "0",
          defaultStageId: data.defaultStageId ?? "",
          contactMappings: (data.contactMappings ?? []) as any,
          dealMappings: (data.dealMappings ?? []) as any,
          tagTriggers: (data.tagTriggers ?? []) as any,
        },
        update: {
          ...(data.enabled !== undefined && { enabled: data.enabled }),
          ...(data.webhookUrl !== undefined && { webhookUrl: data.webhookUrl }),
          ...(data.funnelId !== undefined && { funnelId: data.funnelId }),
          ...(data.defaultStageId !== undefined && { defaultStageId: data.defaultStageId }),
          ...(data.contactMappings !== undefined && { contactMappings: data.contactMappings as any }),
          ...(data.dealMappings !== undefined && { dealMappings: data.dealMappings as any }),
          ...(data.tagTriggers !== undefined && { tagTriggers: data.tagTriggers as any }),
        },
      });

      return NextResponse.json({ success: true, data: config });
    },
    { roles: [UserRole.admin] }
  );
}
