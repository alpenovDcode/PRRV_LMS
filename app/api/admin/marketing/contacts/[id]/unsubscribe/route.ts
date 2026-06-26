import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";
import { logAction } from "@/lib/audit";
import { getMarketingEmailProvider } from "@/lib/email/providers/factory";

/**
 * POST /api/admin/marketing/contacts/[id]/unsubscribe
 *
 * Ручная отписка контакта из админки. Ставит marketing_opt_out=true,
 * пишет EmailEvent с типом unsubscribed, дёргает provider.unsubscribeContact()
 * (если поддерживается провайдером), логирует в AuditLog.
 *
 * Resubscribe: POST с body { subscribe: true } снимает флаг (сценарий «случайно
 * отписали, надо вернуть»). Внешний контакт у провайдера при этом не возвращается
 * автоматически — Евгений может ресубскрайбить руками в Unisender.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    request,
    async (req) => {
      const { id } = await params;
      const body = await request.json().catch(() => ({}));
      const subscribe = body.subscribe === true;

      const user = await db.user.findUnique({
        where: { id },
        select: { id: true, email: true, marketingOptOut: true },
      });

      if (!user) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: { code: "NOT_FOUND", message: "Контакт не найден" } },
          { status: 404 }
        );
      }

      if (subscribe) {
        await db.user.update({
          where: { id },
          data: { marketingOptOut: false, unsubscribedAt: null },
        });
      } else {
        await db.user.update({
          where: { id },
          data: { marketingOptOut: true, unsubscribedAt: new Date() },
        });

        // Записываем событие — для истории контакта и метрик кампаний.
        await db.emailEvent.create({
          data: {
            userId: id,
            email: user.email,
            type: "unsubscribed",
            metadata: { source: "admin_manual", actorId: req.user!.userId },
          },
        });

        // Прокидываем в провайдера (без выкидывания ошибки наружу — если
        // провайдер не настроен или это Yandex SMTP, продолжаем).
        const provider = getMarketingEmailProvider();
        if (provider.unsubscribeContact) {
          try {
            await provider.unsubscribeContact(user.email);
          } catch (error) {
            console.warn("[contacts.unsubscribe] provider failed:", error);
          }
        }
      }

      await logAction(
        req.user!.userId,
        subscribe ? "EMAIL_RESUBSCRIBE" : "EMAIL_UNSUBSCRIBE",
        "User",
        id,
        { email: user.email, source: "admin_manual" }
      );

      return NextResponse.json<ApiResponse>({
        success: true,
        data: { id, marketingOptOut: !subscribe },
      });
    },
    { roles: [UserRole.admin] }
  );
}
