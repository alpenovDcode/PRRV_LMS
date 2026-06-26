import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { applyVariablesAndTracking } from "@/lib/email/compiler/variables";

/**
 * POST /api/admin/marketing/templates/[id]/preview
 *
 * Возвращает финальный HTML письма (после compile + подстановки переменных).
 * Используется в редакторе и в /preview iframe.
 *
 * Body (опционально):
 *   variables — Record<string, string|number>. По умолчанию заполняем
 *     fake-данными чтобы маркетолог видел реалистичный preview:
 *       firstName: "Иван", email: "ivan@example.com" и т.п.
 *
 * Tracking-пиксель и click-wrapper в preview ВКЛЮЧЕНЫ если передан recipientId
 * (для тестов), иначе плейсхолдеры остаются как есть.
 */

const previewSchema = z.object({
  variables: z.record(z.string(), z.union([z.string(), z.number(), z.null()])).optional(),
  recipientId: z.string().optional(),
});

const DEFAULT_PREVIEW_VARS: Record<string, string> = {
  firstName: "Иван",
  fullName: "Иван Петров",
  email: "ivan@example.com",
  "course.title": "Стать репетитором онлайн",
  "course.url": "https://prrv.tech/courses/become-tutor",
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    request,
    async () => {
      const { id } = await params;
      const body = await request.json().catch(() => ({}));
      const { variables = {}, recipientId } = previewSchema.parse(body);

      const template = await db.emailVisualTemplate.findUnique({
        where: { id },
        select: { compiledHtml: true, subject: true, preheader: true },
      });
      if (!template) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: { code: "NOT_FOUND", message: "Шаблон не найден" } },
          { status: 404 }
        );
      }

      const mergedVars = { ...DEFAULT_PREVIEW_VARS, ...variables };
      const html = applyVariablesAndTracking({
        html: template.compiledHtml,
        variables: mergedVars,
        recipientId,
        // В preview не дёргаем pixel/click-tracking, чтобы не плодить лишних
        // EmailEvent — только подстановка переменных.
        enableOpenTracking: false,
        enableClickTracking: false,
      });

      return NextResponse.json<ApiResponse>({
        success: true,
        data: { html, subject: template.subject, preheader: template.preheader },
      });
    },
    { roles: [UserRole.admin] }
  );
}
