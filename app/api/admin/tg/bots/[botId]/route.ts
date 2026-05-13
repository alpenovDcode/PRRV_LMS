import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-middleware";
import { deleteBot, refreshWebhook, getWebhookInfo } from "@/lib/tg/bot-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params: paramsP }: { params: Promise<{ botId: string }> }
) {
  const params = await paramsP;
  return withAuth(
    request,
    async () => {
      const bot = await db.tgBot.findUnique({
        where: { id: params.botId },
        select: {
          id: true,
          username: true,
          title: true,
          isActive: true,
          subscriberCount: true,
          tokenPrefix: true,
          webhookUrl: true,
          defaultStartFlowId: true,
          adminChatIds: true,
          timezone: true,
          createdAt: true,
        },
      });
      if (!bot) {
        return NextResponse.json(
          { success: false, error: { code: "NOT_FOUND", message: "Bot not found" } },
          { status: 404 }
        );
      }
      const info = await getWebhookInfo(bot.id);
      return NextResponse.json({
        success: true,
        data: { bot, webhookInfo: info.info ?? null, webhookError: info.error ?? null },
      });
    },
    { roles: ["admin"] }
  );
}

const patchSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  isActive: z.boolean().optional(),
  defaultStartFlowId: z.string().nullable().optional(),
  // Telegram chat_ids of admins whose inbound media gets auto-saved
  // to the media library. We store as strings since chat_id is int64.
  adminChatIds: z.array(z.string().regex(/^-?\d+$/)).max(10).optional(),
  timezone: z.string().max(64).nullable().optional(),
  refreshWebhook: z.boolean().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params: paramsP }: { params: Promise<{ botId: string }> }
) {
  const params = await paramsP;
  return withAuth(
    request,
    async (req) => {
      const body = await req.json().catch(() => null);
      const parsed = patchSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, error: { code: "BAD_INPUT", message: parsed.error.message } },
          { status: 400 }
        );
      }
      const { refreshWebhook: shouldRefresh, ...rest } = parsed.data;
      const updated = await db.tgBot.update({
        where: { id: params.botId },
        data: rest,
      });
      if (shouldRefresh) {
        const r = await refreshWebhook(params.botId);
        if (!r.ok) {
          return NextResponse.json(
            { success: false, error: { code: "WEBHOOK_FAILED", message: r.error } },
            { status: 500 }
          );
        }
      }
      return NextResponse.json({ success: true, data: { id: updated.id } });
    },
    { roles: ["admin"] }
  );
}

export async function DELETE(
  request: NextRequest,
  { params: paramsP }: { params: Promise<{ botId: string }> }
) {
  const params = await paramsP;
  return withAuth(
    request,
    async () => {
      const r = await deleteBot(params.botId);
      if (!r.ok) {
        return NextResponse.json(
          { success: false, error: { code: "DELETE_FAILED", message: r.error } },
          { status: 500 }
        );
      }
      return NextResponse.json({ success: true });
    },
    { roles: ["admin"] }
  );
}
