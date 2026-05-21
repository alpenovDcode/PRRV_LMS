import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api-middleware";
import { rotateToken } from "@/lib/tg/bot-service";
import { trackEvent } from "@/lib/tg/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  token: z.string().min(20).max(200),
});

// Ротация bot-токена. См. rotateToken() — он гарантирует, что новый
// токен принадлежит тому же боту, и переустанавливает webhook до
// записи в БД.
export async function POST(
  request: NextRequest,
  { params: paramsP }: { params: Promise<{ botId: string }> }
) {
  const params = await paramsP;
  return withAuth(
    request,
    async (req) => {
      const body = await req.json().catch(() => null);
      const parsed = schema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          {
            success: false,
            error: { code: "BAD_INPUT", message: parsed.error.message },
          },
          { status: 400 }
        );
      }
      const r = await rotateToken(params.botId, parsed.data.token);
      if (!r.ok) {
        return NextResponse.json(
          { success: false, error: { code: "ROTATE_FAILED", message: r.error } },
          { status: 400 }
        );
      }
      trackEvent({
        type: "bot.token_rotated",
        botId: params.botId,
        properties: { userId: req.user?.userId ?? null },
      }).catch(() => {});
      return NextResponse.json({ success: true });
    },
    { roles: ["admin"] }
  );
}
