import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";
import { logAction } from "@/lib/audit";

/**
 * POST /api/admin/marketing/templates/[id]/duplicate
 *
 * Копирует шаблон со всеми блоками и предкомпиленным HTML.
 * Имя — «<исходное> (копия)».
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    request,
    async (req) => {
      const { id } = await params;
      const source = await db.emailVisualTemplate.findUnique({ where: { id } });

      if (!source) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: { code: "NOT_FOUND", message: "Шаблон не найден" } },
          { status: 404 }
        );
      }

      const copy = await db.emailVisualTemplate.create({
        data: {
          name: `${source.name} (копия)`,
          category: source.category,
          subject: source.subject,
          preheader: source.preheader,
          blocks: source.blocks ?? {},
          compiledHtml: source.compiledHtml,
          createdBy: req.user!.userId,
        },
      });

      await logAction(req.user!.userId, "EMAIL_TEMPLATE_DUPLICATE", "EmailVisualTemplate", copy.id, {
        sourceId: id,
        name: copy.name,
      });

      return NextResponse.json<ApiResponse>({ success: true, data: copy });
    },
    { roles: [UserRole.admin] }
  );
}
