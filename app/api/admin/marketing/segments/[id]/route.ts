import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { compileSegmentFilters, segmentFiltersSchema } from "@/lib/email/segments/compile-filters";
import { logAction } from "@/lib/audit";

/**
 * GET /api/admin/marketing/segments/[id]
 *
 * Детали одного сегмента + статистика использования (сколько кампаний к нему привязано).
 * contactCount возвращается из БД — без пересчёта (preview делает это явно).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    request,
    async () => {
      const { id } = await params;

      const segment = await db.emailSegment.findUnique({
        where: { id },
        include: {
          campaigns: {
            select: { id: true, name: true, status: true, finishedAt: true },
            orderBy: { createdAt: "desc" },
            take: 10,
          },
        },
      });

      if (!segment) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: { code: "NOT_FOUND", message: "Сегмент не найден" } },
          { status: 404 }
        );
      }

      return NextResponse.json<ApiResponse>({
        success: true,
        data: segment,
      });
    },
    { roles: [UserRole.admin] }
  );
}

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).nullable().optional(),
  filters: segmentFiltersSchema.optional(),
});

/**
 * PATCH /api/admin/marketing/segments/[id]
 *
 * Обновляет имя/описание/фильтры. Если фильтры менялись — пересчитывает contactCount.
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

      const existing = await db.emailSegment.findUnique({ where: { id } });
      if (!existing) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: { code: "NOT_FOUND", message: "Сегмент не найден" } },
          { status: 404 }
        );
      }

      const updateData: Record<string, unknown> = {};
      if (data.name !== undefined) updateData.name = data.name;
      if (data.description !== undefined) updateData.description = data.description;
      if (data.filters !== undefined) {
        updateData.filters = data.filters;
        // Пересчитываем размер по новым фильтрам.
        updateData.contactCount = await db.user.count({
          where: compileSegmentFilters(data.filters),
        });
      }

      const segment = await db.emailSegment.update({
        where: { id },
        data: updateData,
      });

      await logAction(req.user!.userId, "EMAIL_SEGMENT_UPDATE", "EmailSegment", id, {
        name: segment.name,
      });

      return NextResponse.json<ApiResponse>({ success: true, data: segment });
    },
    { roles: [UserRole.admin] }
  );
}

/**
 * DELETE /api/admin/marketing/segments/[id]
 *
 * Удаляет сегмент. EmailCampaign.segmentId выставится в NULL (onDelete: SetNull в schema).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    request,
    async (req) => {
      const { id } = await params;

      const existing = await db.emailSegment.findUnique({
        where: { id },
        select: { name: true },
      });
      if (!existing) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: { code: "NOT_FOUND", message: "Сегмент не найден" } },
          { status: 404 }
        );
      }

      await db.emailSegment.delete({ where: { id } });
      await logAction(req.user!.userId, "EMAIL_SEGMENT_DELETE", "EmailSegment", id, {
        name: existing.name,
      });

      return NextResponse.json<ApiResponse>({ success: true, data: { id } });
    },
    { roles: [UserRole.admin] }
  );
}
