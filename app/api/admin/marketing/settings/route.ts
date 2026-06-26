import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";

/**
 * GET /api/admin/marketing/settings
 *
 * Возвращает текущую конфигурацию маркетингового модуля. Используется
 * для отображения «как это сейчас настроено» на странице Настроек.
 *
 * Не возвращает секреты — только их статус (есть/нет) и публичные части.
 */
export async function GET(request: NextRequest) {
  return withAuth(
    request,
    async () => {
      const provider = (process.env.EMAIL_MARKETING_PROVIDER || "yandex").toLowerCase();
      const trackingBase =
        process.env.EMAIL_TRACKING_BASE_URL ||
        process.env.NEXT_PUBLIC_APP_URL ||
        "https://prrv.tech";

      return NextResponse.json<ApiResponse>({
        success: true,
        data: {
          provider,
          fromName: process.env.EMAIL_MARKETING_FROM_NAME || "Прорыв",
          fromEmail: process.env.EMAIL_MARKETING_FROM_EMAIL || null,
          trackingBaseUrl: trackingBase,
          // URL'ы для копирования в кабинет Unisender / DNS.
          webhookUrl: `${trackingBase}/api/email/webhook/${provider}`,
          trackingPixelExample: `${trackingBase}/api/email/track/open/<recipientId>.gif`,
          unsubscribeExample: `${trackingBase}/email/unsubscribe/<token>`,
          // Что задано из секретов — только true/false, не сами значения.
          configStatus: {
            cronSecret: !!process.env.EMAIL_CRON_SECRET,
            unisenderApiKey: !!process.env.UNISENDER_API_KEY,
            unisenderWebhookSecret: !!process.env.UNISENDER_WEBHOOK_SECRET,
            unisenderDefaultListId: !!process.env.UNISENDER_DEFAULT_LIST_ID,
            smtpUser: !!process.env.SMTP_USER,
            smtpPassword: !!process.env.SMTP_PASSWORD,
          },
          // Для маркетингового домена — рекомендуемые DNS записи.
          dnsExample: {
            spf: 'v=spf1 include:_spf.unisender.com -all',
            dkim: '<value from Unisender cabinet>',
            dmarc: 'v=DMARC1; p=quarantine; rua=mailto:dmarc@prrv.tech',
          },
        },
      });
    },
    { roles: [UserRole.admin] }
  );
}
