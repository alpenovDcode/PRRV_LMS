/**
 * GET /api/admin/tg/external-event-info
 *
 * Возвращает админу:
 *   - URL endpoint'а внешних событий (для копипасты в GetCourse / Bizon)
 *   - готов ли env (EXTERNAL_EVENT_SECRET задан)
 *   - готовый curl-пример
 *
 * Сам secret НЕ отдаём — админ получает его от того, кто его задавал в env.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return withAuth(
    req,
    async () => {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://prrv.tech";
      const configured = !!process.env.EXTERNAL_EVENT_SECRET;
      const webhookUrl = `${appUrl}/api/tg/external-event`;
      const curlExample = [
        `curl -X POST ${webhookUrl} \\`,
        `  -H "Authorization: Bearer YOUR_SECRET" \\`,
        `  -H "Content-Type: application/json" \\`,
        `  -d '{`,
        `    "botId": "<BOT_UUID>",`,
        `    "eventName": "autointensive0426_ap",`,
        `    "subscriber": { "tgUserId": "123456789" },`,
        `    "properties": { "amount": 1000 }`,
        `  }'`,
      ].join("\n");

      return NextResponse.json({
        success: true,
        data: {
          configured,
          webhookUrl,
          curlExample,
          fields: {
            authHeader: "Authorization: Bearer <EXTERNAL_EVENT_SECRET>",
            envName: "EXTERNAL_EVENT_SECRET",
            note:
              "Задайте EXTERNAL_EVENT_SECRET в env (openssl rand -hex 32) и передайте куратору GetCourse/Bizon. Без secret'а endpoint отвечает 503.",
          },
        },
      });
    },
    { roles: ["admin"] }
  );
}
