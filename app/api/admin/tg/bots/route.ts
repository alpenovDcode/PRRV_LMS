import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-middleware";
import { connectBot, connectBotForwarded } from "@/lib/tg/bot-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return withAuth(
    request,
    async () => {
      const bots = await db.tgBot.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          username: true,
          title: true,
          isActive: true,
          subscriberCount: true,
          tokenPrefix: true,
          webhookUrl: true,
          createdAt: true,
          defaultStartFlowId: true,
          connectionMode: true,
        } as any,
      });
      return NextResponse.json({ success: true, data: bots });
    },
    { roles: ["admin"] }
  );
}

const createBotSchema = z.object({
  token: z.string().min(40),
  title: z.string().min(1).max(120).optional(),
  /**
   * "webhook"   — LMS сама вызывает setWebhook у Telegram (стандарт).
   * "forwarded" — LMS только принимает форварды от внешнего бэка
   *               (например prepodavai-polling). setWebhook не вызывается,
   *               sender не отправляет исходящих — только observability.
   */
  mode: z.enum(["webhook", "forwarded"]).optional().default("webhook"),
});

export async function POST(request: NextRequest) {
  return withAuth(
    request,
    async (req) => {
      const body = await req.json().catch(() => null);
      const parsed = createBotSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, error: { code: "BAD_INPUT", message: parsed.error.message } },
          { status: 400 }
        );
      }
      const { mode, ...connectInput } = parsed.data;
      const res =
        mode === "forwarded"
          ? await connectBotForwarded(connectInput)
          : await connectBot(connectInput);
      if (!res.ok) {
        return NextResponse.json(
          { success: false, error: { code: "CONNECT_FAILED", message: res.error } },
          { status: 400 }
        );
      }
      // Для forwarded режима отдаём webhookSecret ОДИН РАЗ — админу нужно
      // вставить его в env внешнего бэка. После сохранения в БД секрет
      // получить нельзя (только ротировать).
      return NextResponse.json({
        success: true,
        data: { ...res.bot, mode, ...(mode === "forwarded" ? { webhookSecret: (res as any).webhookSecret } : {}) },
      });
    },
    { roles: ["admin"] }
  );
}
