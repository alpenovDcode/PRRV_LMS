import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { getBotProvider } from "@/lib/messaging/providers/factory";
import { recordOutboundMessage } from "@/lib/messaging/inbox";

const schema = z.object({
  text: z.string().min(1).max(4000),
});

/**
 * POST /api/admin/messaging/subscribers/[id]/reply
 *
 * Ручной ответ оператора. Шлёт текст через провайдера + логирует
 * в Inbox с source="operator:<userId>".
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    req,
    async (authedReq) => {
      const { id } = await params;
      const body = await req.json().catch(() => null);
      const parsed = schema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ success: false, error: "Текст обязателен" }, { status: 400 });
      }

      const subscriber = await db.messagingSubscriber.findUnique({
        where: { id },
        include: { bot: true },
      });
      if (!subscriber) {
        return NextResponse.json({ success: false, error: "Не найдено" }, { status: 404 });
      }

      const provider = getBotProvider(subscriber.bot.channel);
      try {
        const sent = await provider.sendText(subscriber.bot, subscriber, parsed.data.text);
        await recordOutboundMessage({
          botId: subscriber.bot.id,
          subscriberId: subscriber.id,
          text: parsed.data.text,
          externalMessageId: sent.externalMessageId,
          source: `operator:${authedReq.user!.userId}`,
        });
        return NextResponse.json({ success: true });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ success: false, error: msg }, { status: 400 });
      }
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}
