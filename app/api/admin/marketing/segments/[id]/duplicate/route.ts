import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";
import { logAction } from "@/lib/audit";

/**
 * POST /api/admin/marketing/segments/[id]/duplicate
 *
 * Создаёт копию сегмента с пометкой «(копия)». Удобно когда нужно
 * сделать «как этот, но с одной правкой» — частый паттерн в маркетинге.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    request,
    async (req) => {
      const { id } = await params;
      const source = await db.emailSegment.findUnique({ where: { id } });
      if (!source) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: { code: "NOT_FOUND", message: "Сегмент не найден" } },
          { status: 404 }
        );
      }

      const copy = await db.emailSegment.create({
        data: {
          name: `${source.name} (копия)`,
          description: source.description,
          filters: source.filters ?? {},
          contactCount: source.contactCount,
          createdBy: req.user!.userId,
        },
      });

      await logAction(req.user!.userId, "EMAIL_SEGMENT_DUPLICATE", "EmailSegment", copy.id, {
        sourceId: id,
        name: copy.name,
      });

      return NextResponse.json<ApiResponse>({ success: true, data: copy });
    },
    { roles: [UserRole.admin] }
  );
}
