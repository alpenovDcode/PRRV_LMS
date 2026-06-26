import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";
import { compileSegmentFilters, segmentFiltersSchema } from "@/lib/email/segments/compile-filters";

/**
 * POST /api/admin/marketing/segments/preview
 *
 * Live-preview сегмента: размер + sample первых 10 контактов.
 * Дёргается из конструктора фильтров на каждое изменение (с debounce).
 *
 * Не сохраняет ничего, не пишет аудит — это чисто чтение.
 *
 * Body: { filters: SegmentFilters }
 * Response: { count, sample: ContactPreview[] }
 */
export async function POST(request: NextRequest) {
  return withAuth(
    request,
    async () => {
      const body = await request.json();
      const filters = segmentFiltersSchema.parse(body.filters ?? {});
      const where = compileSegmentFilters(filters);

      const [count, sample] = await Promise.all([
        db.user.count({ where }),
        db.user.findMany({
          where,
          select: {
            id: true,
            email: true,
            fullName: true,
            role: true,
            tariff: true,
            track: true,
            createdAt: true,
            lastActiveAt: true,
            marketingOptOut: true,
            emailTags: true,
          },
          orderBy: { createdAt: "desc" },
          take: 10,
        }),
      ]);

      return NextResponse.json<ApiResponse>({
        success: true,
        data: { count, sample },
      });
    },
    { roles: [UserRole.admin] }
  );
}
