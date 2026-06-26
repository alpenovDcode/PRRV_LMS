import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { UserRole, Prisma } from "@prisma/client";
import { z } from "zod";
import { logAction } from "@/lib/audit";
import { TRIGGER_TYPES } from "@/lib/email/automations/types";

/**
 * GET /api/admin/marketing/automations
 *
 * Список автоматизаций. Включает счётчик активных runs (для индикатора в UI).
 */
export async function GET(request: NextRequest) {
  return withAuth(
    request,
    async () => {
      const items = await db.emailAutomation.findMany({
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          name: true,
          trigger: true,
          triggerData: true,
          steps: true,
          isActive: true,
          stats: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              runs: { where: { status: "running" } },
            },
          },
        },
      });
      return NextResponse.json<ApiResponse>({
        success: true,
        data: { items },
      });
    },
    { roles: [UserRole.admin] }
  );
}

const stepSchema = z.object({
  delayHours: z.number().int().min(0).max(8760), // до года
  templateId: z.string().uuid(),
  label: z.string().max(200).optional(),
});

const createSchema = z.object({
  name: z.string().min(1).max(200),
  trigger: z.enum(TRIGGER_TYPES),
  triggerData: z.record(z.string(), z.unknown()).optional(),
  steps: z.array(stepSchema).min(1).max(20),
});

/**
 * POST /api/admin/marketing/automations
 *
 * Создаёт автоматизацию в выключенном (isActive=false) состоянии.
 * Активировать — отдельным запросом, чтобы маркетолог явно проверил шаги
 * прежде чем запустить.
 */
export async function POST(request: NextRequest) {
  return withAuth(
    request,
    async (req) => {
      const body = await request.json();
      const data = createSchema.parse(body);

      const automation = await db.emailAutomation.create({
        data: {
          name: data.name,
          trigger: data.trigger,
          triggerData: (data.triggerData ?? {}) as Prisma.InputJsonValue,
          steps: data.steps as unknown as Prisma.InputJsonValue,
          isActive: false,
          createdBy: req.user!.userId,
        },
      });

      await logAction(
        req.user!.userId,
        "EMAIL_AUTOMATION_CREATE",
        "EmailAutomation",
        automation.id,
        { name: automation.name, trigger: automation.trigger }
      );

      return NextResponse.json<ApiResponse>({ success: true, data: automation });
    },
    { roles: [UserRole.admin] }
  );
}
