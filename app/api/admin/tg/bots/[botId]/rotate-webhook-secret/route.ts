import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { rotateWebhookSecret } from "@/lib/tg/bot-service";
import { trackEvent } from "@/lib/tg/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Ротация webhookSecret — генерим новый, setWebhook с ним, и только
// после успеха обновляем БД. Старый секрет до этого момента валиден,
// чтобы webhook-калбэки не отбивались посредине ротации.
export async function POST(
  request: NextRequest,
  { params: paramsP }: { params: Promise<{ botId: string }> }
) {
  const params = await paramsP;
  return withAuth(
    request,
    async (req) => {
      const r = await rotateWebhookSecret(params.botId);
      if (!r.ok) {
        return NextResponse.json(
          { success: false, error: { code: "ROTATE_FAILED", message: r.error } },
          { status: 400 }
        );
      }
      trackEvent({
        type: "bot.webhook_secret_rotated",
        botId: params.botId,
        properties: { userId: req.user?.userId ?? null },
      }).catch(() => {});
      return NextResponse.json({ success: true });
    },
    { roles: ["admin"] }
  );
}
