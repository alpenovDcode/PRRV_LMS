import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { compileDocumentToHtml } from "@/lib/email/compiler/blocks-to-html";
import { logAction } from "@/lib/audit";

/**
 * GET /api/admin/marketing/templates/[id]
 *
 * Возвращает полный шаблон включая blocks (EmailDocument) и compiledHtml.
 * Используется в редакторе для загрузки и в preview.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    request,
    async () => {
      const { id } = await params;

      const template = await db.emailVisualTemplate.findUnique({
        where: { id },
        include: {
          campaigns: {
            select: { id: true, name: true, status: true, finishedAt: true },
            orderBy: { createdAt: "desc" },
            take: 10,
          },
        },
      });

      if (!template) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: { code: "NOT_FOUND", message: "Шаблон не найден" } },
          { status: 404 }
        );
      }

      return NextResponse.json<ApiResponse>({ success: true, data: template });
    },
    { roles: [UserRole.admin] }
  );
}

/**
 * PATCH /api/admin/marketing/templates/[id]
 *
 * Принимает любую комбинацию полей. Если blocks обновляется — recompile compiledHtml.
 * Это значит шаблон всегда хранит актуальный HTML на момент последнего сохранения.
 */
const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  subject: z.string().min(1).max(500).optional(),
  preheader: z.string().max(500).nullable().optional(),
  category: z.enum(["marketing", "warmup"]).optional(),
  blocks: z.unknown().optional(), // полная структура EmailDocument
  isArchived: z.boolean().optional(),
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

      const existing = await db.emailVisualTemplate.findUnique({ where: { id } });
      if (!existing) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: { code: "NOT_FOUND", message: "Шаблон не найден" } },
          { status: 404 }
        );
      }

      const updateData: Record<string, unknown> = {};

      if (data.name !== undefined) updateData.name = data.name;
      if (data.subject !== undefined) updateData.subject = data.subject;
      if (data.preheader !== undefined) updateData.preheader = data.preheader;
      if (data.category !== undefined) updateData.category = data.category;
      if (data.isArchived !== undefined) updateData.isArchived = data.isArchived;

      if (data.blocks !== undefined) {
        updateData.blocks = data.blocks;

        // Recompile HTML.
        type EmailDoc = Parameters<typeof compileDocumentToHtml>[0];
        const doc = data.blocks as EmailDoc;
        updateData.compiledHtml = compileDocumentToHtml(doc, {
          documentTitle: data.name ?? existing.name,
          preheader:
            data.preheader === null
              ? undefined
              : data.preheader ?? existing.preheader ?? undefined,
        });
      }

      const template = await db.emailVisualTemplate.update({
        where: { id },
        data: updateData,
      });

      await logAction(req.user!.userId, "EMAIL_TEMPLATE_UPDATE", "EmailVisualTemplate", id, {
        name: template.name,
        recompiled: data.blocks !== undefined,
      });

      return NextResponse.json<ApiResponse>({ success: true, data: template });
    },
    { roles: [UserRole.admin] }
  );
}

/**
 * DELETE /api/admin/marketing/templates/[id]
 *
 * Удаляет шаблон. Связанные кампании теряют templateId (onDelete SetNull).
 * В UI это будет показано как «шаблон удалён» — кампания не сломается.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    request,
    async (req) => {
      const { id } = await params;

      const existing = await db.emailVisualTemplate.findUnique({
        where: { id },
        select: { name: true },
      });
      if (!existing) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: { code: "NOT_FOUND", message: "Шаблон не найден" } },
          { status: 404 }
        );
      }

      await db.emailVisualTemplate.delete({ where: { id } });
      await logAction(req.user!.userId, "EMAIL_TEMPLATE_DELETE", "EmailVisualTemplate", id, {
        name: existing.name,
      });

      return NextResponse.json<ApiResponse>({ success: true, data: { id } });
    },
    { roles: [UserRole.admin] }
  );
}
