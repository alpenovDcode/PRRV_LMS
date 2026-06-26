import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { logAction } from "@/lib/audit";
import { TRIGGER_TYPES } from "@/lib/email/automations/types";

/**
 * GET /api/admin/marketing/automations/[id]
 *
 * Детали + 20 последних runs для отладки (видно кто получает цепочку,
 * на каком шаге, какие отвалились).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    request,
    async () => {
      const { id } = await params;
      const automation = await db.emailAutomation.findUnique({
        where: { id },
        include: {
          runs: {
            orderBy: { startedAt: "desc" },
            take: 20,
            select: {
              id: true,
              userId: true,
              currentStep: true,
              nextStepAt: true,
              status: true,
              startedAt: true,
              completedAt: true,
              user: { select: { id: true, email: true, fullName: true } },
            },
          },
        },
      });

      if (!automation) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: { code: "NOT_FOUND", message: "Не найдена" } },
          { status: 404 }
        );
      }

      return NextResponse.json<ApiResponse>({ success: true, data: automation });
    },
    { roles: [UserRole.admin] }
  );
}

const stepSchema = z.object({
  delayHours: z.number().int().min(0).max(8760),
  templateId: z.string().uuid(),
  label: z.string().max(200).optional(),
});

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  trigger: z.enum(TRIGGER_TYPES).optional(),
  triggerData: z.record(z.string(), z.unknown()).nullable().optional(),
  steps: z.array(stepSchema).min(1).max(20).optional(),
  isActive: z.boolean().optional(),
});

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

      const existing = await db.emailAutomation.findUnique({
        where: { id },
        select: { name: true },
      });
      if (!existing) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: { code: "NOT_FOUND", message: "Не найдена" } },
          { status: 404 }
        );
      }

      const updateData: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(data)) {
        if (v !== undefined) updateData[k] = v;
      }

      const automation = await db.emailAutomation.update({
        where: { id },
        data: updateData,
      });

      await logAction(
        req.user!.userId,
        "EMAIL_AUTOMATION_UPDATE",
        "EmailAutomation",
        id,
        { name: automation.name }
      );

      return NextResponse.json<ApiResponse>({ success: true, data: automation });
    },
    { roles: [UserRole.admin] }
  );
}

/**
 * DELETE /api/admin/marketing/automations/[id]
 *
 * Удаляет автоматизацию. EmailAutomationRun каскадно удалится.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    request,
    async (req) => {
      const { id } = await params;
      const existing = await db.emailAutomation.findUnique({
        where: { id },
        select: { name: true },
      });
      if (!existing) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: { code: "NOT_FOUND", message: "Не найдена" } },
          { status: 404 }
        );
      }

      await db.emailAutomation.delete({ where: { id } });
      await logAction(
        req.user!.userId,
        "EMAIL_AUTOMATION_DELETE",
        "EmailAutomation",
        id,
        { name: existing.name }
      );

      return NextResponse.json<ApiResponse>({ success: true, data: { id } });
    },
    { roles: [UserRole.admin] }
  );
}
