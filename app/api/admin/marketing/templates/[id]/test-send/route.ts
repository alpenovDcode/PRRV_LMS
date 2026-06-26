import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { applyVariablesAndTracking } from "@/lib/email/compiler/variables";
import { getMarketingEmailProvider } from "@/lib/email/providers/factory";
import { logAction } from "@/lib/audit";

/**
 * POST /api/admin/marketing/templates/[id]/test-send
 *
 * Отправляет тестовое письмо на email админа (или указанный в body).
 * Идёт через ТЕКУЩИЙ маркетинговый провайдер (yandex / unisender по env).
 *
 * Tracking-пиксель и click-wrapper включены — чтобы вживую проверить, что
 * подписки на webhook и редиректы работают. Записи EmailEvent создаются как обычно,
 * с пометкой source: "test-send".
 *
 * Body:
 *   to (optional)        — email получателя, default email админа
 *   variables (optional) — Record<string, string|number>
 */

const bodySchema = z.object({
  to: z.string().email().optional(),
  variables: z.record(z.string(), z.union([z.string(), z.number(), z.null()])).optional(),
});

const DEFAULT_PREVIEW_VARS: Record<string, string> = {
  firstName: "Тест",
  fullName: "Тестовый Пользователь",
  email: "test@prrv.tech",
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    request,
    async (req) => {
      const { id } = await params;
      const body = await request.json().catch(() => ({}));
      const { to, variables = {} } = bodySchema.parse(body);

      const target = to ?? req.user!.email;

      const template = await db.emailVisualTemplate.findUnique({
        where: { id },
        select: { id: true, name: true, subject: true, preheader: true, compiledHtml: true },
      });
      if (!template) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: { code: "NOT_FOUND", message: "Шаблон не найден" } },
          { status: 404 }
        );
      }

      const mergedVars = { ...DEFAULT_PREVIEW_VARS, ...variables, email: target };
      const finalHtml = applyVariablesAndTracking({
        html: template.compiledHtml,
        variables: mergedVars,
        // recipientId не передаём — тестовая отправка не привязана к BroadcastRecipient
        // или EmailDeliveryJob. Tracking отключаем явно.
        enableOpenTracking: false,
        enableClickTracking: false,
      });

      const provider = getMarketingEmailProvider();
      try {
        const result = await provider.sendOne({
          to: target,
          subject: `[ТЕСТ] ${template.subject}`,
          html: finalHtml,
          fromName: process.env.EMAIL_MARKETING_FROM_NAME || "Прорыв",
          fromEmail:
            process.env.EMAIL_MARKETING_FROM_EMAIL ||
            process.env.SMTP_USER ||
            "noreply@prrv.tech",
          headers: { "X-Template-Id": template.id, "X-Test-Send": "1" },
        });

        await logAction(
          req.user!.userId,
          "EMAIL_TEMPLATE_TEST_SEND",
          "EmailVisualTemplate",
          template.id,
          {
            to: target,
            provider: provider.name,
            messageId: result.providerMessageId ?? null,
          }
        );

        return NextResponse.json<ApiResponse>({
          success: true,
          data: { to: target, provider: provider.name, messageId: result.providerMessageId },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await logAction(
          req.user!.userId,
          "EMAIL_TEMPLATE_TEST_SEND_FAILED",
          "EmailVisualTemplate",
          template.id,
          { to: target, error: message.slice(0, 500) }
        );
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: { code: "PROVIDER_ERROR", message: `Не удалось отправить: ${message}` },
          },
          { status: 502 }
        );
      }
    },
    { roles: [UserRole.admin] }
  );
}
