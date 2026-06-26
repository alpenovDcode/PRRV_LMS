import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { compileSegmentFilters, segmentFiltersSchema } from "@/lib/email/segments/compile-filters";
import { logAction } from "@/lib/audit";

/**
 * GET /api/admin/marketing/segments
 *
 * Список сегментов с полем contactCount (актуальный или из снимка).
 * contactCount пересчитывается лениво — на /preview и при отправке кампании,
 * иначе показываем сохранённое значение и метку «требует обновления».
 */
export async function GET(request: NextRequest) {
  return withAuth(
    request,
    async () => {
      const segments = await db.emailSegment.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          description: true,
          contactCount: true,
          providerListId: true,
          syncedAt: true,
          createdAt: true,
          updatedAt: true,
          createdBy: true,
          _count: { select: { campaigns: true } },
        },
      });

      return NextResponse.json<ApiResponse>({
        success: true,
        data: { items: segments },
      });
    },
    { roles: [UserRole.admin] }
  );
}

const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  filters: segmentFiltersSchema,
});

/**
 * POST /api/admin/marketing/segments
 *
 * Создаёт сегмент. Сразу считает contactCount по текущей БД,
 * чтобы в списке не показывался ноль.
 */
export async function POST(request: NextRequest) {
  return withAuth(
    request,
    async (req) => {
      const body = await request.json();
      const data = createSchema.parse(body);

      const where = compileSegmentFilters(data.filters);
      const contactCount = await db.user.count({ where });

      const segment = await db.emailSegment.create({
        data: {
          name: data.name,
          description: data.description ?? null,
          filters: data.filters,
          contactCount,
          createdBy: req.user!.userId,
        },
      });

      await logAction(req.user!.userId, "EMAIL_SEGMENT_CREATE", "EmailSegment", segment.id, {
        name: segment.name,
        contactCount,
      });

      return NextResponse.json<ApiResponse>({
        success: true,
        data: segment,
      });
    },
    { roles: [UserRole.admin] }
  );
}
