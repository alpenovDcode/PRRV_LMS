import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { compileDocumentToHtml } from "@/lib/email/compiler/blocks-to-html";
import { buildStartingDocument, STARTING_LAYOUTS } from "@/lib/email/editor/default-blocks";
import { logAction } from "@/lib/audit";

/**
 * GET /api/admin/marketing/templates
 *
 * Список всех визуальных шаблонов. Возвращает thumbnail_url если есть,
 * имя, категорию, дату обновления и счётчик кампаний, использующих шаблон.
 *
 * Query: ?archived=true — показать архивные. По умолчанию isArchived=false.
 */
export async function GET(request: NextRequest) {
  return withAuth(
    request,
    async () => {
      const { searchParams } = new URL(request.url);
      const showArchived = searchParams.get("archived") === "true";

      const templates = await db.emailVisualTemplate.findMany({
        where: showArchived ? undefined : { isArchived: false },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          name: true,
          category: true,
          subject: true,
          preheader: true,
          thumbnailUrl: true,
          isArchived: true,
          createdAt: true,
          updatedAt: true,
          createdBy: true,
          _count: { select: { campaigns: true } },
        },
      });

      return NextResponse.json<ApiResponse>({
        success: true,
        data: { items: templates },
      });
    },
    { roles: [UserRole.admin] }
  );
}

const layoutSchema = z.enum(["blank", "promo", "digest", "welcome"]);

const createSchema = z.object({
  name: z.string().min(1).max(200),
  category: z.enum(["marketing", "warmup"]).default("marketing"),
  subject: z.string().min(1).max(500),
  preheader: z.string().max(500).optional(),
  layout: layoutSchema.optional(), // стартовый макет, если шаблон создаётся новым
});

/**
 * POST /api/admin/marketing/templates
 *
 * Создаёт шаблон. Если передан layout (blank/promo/digest/welcome) —
 * blocks заполняется из стартового макета. Иначе пустой.
 *
 * Сразу компилирует HTML и сохраняет в compiledHtml, чтобы превью на /templates
 * работало без recompile при каждом запросе.
 */
export async function POST(request: NextRequest) {
  return withAuth(
    request,
    async (req) => {
      const body = await request.json();
      const data = createSchema.parse(body);

      const document = buildStartingDocument(data.layout ?? "blank");
      const compiledHtml = compileDocumentToHtml(document, {
        documentTitle: data.name,
        preheader: data.preheader,
      });

      const template = await db.emailVisualTemplate.create({
        data: {
          name: data.name,
          category: data.category,
          subject: data.subject,
          preheader: data.preheader ?? null,
          blocks: document as unknown as object,
          compiledHtml,
          createdBy: req.user!.userId,
        },
      });

      await logAction(req.user!.userId, "EMAIL_TEMPLATE_CREATE", "EmailVisualTemplate", template.id, {
        name: template.name,
        layout: data.layout ?? "blank",
      });

      return NextResponse.json<ApiResponse>({
        success: true,
        data: { ...template, _layouts: STARTING_LAYOUTS },
      });
    },
    { roles: [UserRole.admin] }
  );
}
