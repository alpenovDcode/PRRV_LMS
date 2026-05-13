import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-middleware";
import { connectBot } from "@/lib/tg/bot-service";

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
        },
      });
      return NextResponse.json({ success: true, data: bots });
    },
    { roles: ["admin"] }
  );
}

const createBotSchema = z.object({
  token: z.string().min(40),
  title: z.string().min(1).max(120).optional(),
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
      const res = await connectBot(parsed.data);
      if (!res.ok) {
        return NextResponse.json(
          { success: false, error: { code: "CONNECT_FAILED", message: res.error } },
          { status: 400 }
        );
      }
      return NextResponse.json({ success: true, data: res.bot });
    },
    { roles: ["admin"] }
  );
}
