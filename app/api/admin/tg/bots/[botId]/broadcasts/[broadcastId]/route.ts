import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-middleware";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params: paramsP }: { params: Promise<{ botId: string; broadcastId: string }> }
) {
  const params = await paramsP;
  return withAuth(
    request,
    async () => {
      const broadcast = await db.tgBroadcast.findFirst({
        where: { id: params.broadcastId, botId: params.botId },
      });
      if (!broadcast) {
        return NextResponse.json(
          { success: false, error: { code: "NOT_FOUND", message: "Broadcast not found" } },
          { status: 404 }
        );
      }
      const recentRecipients = await db.tgBroadcastRecipient.findMany({
        where: { broadcastId: broadcast.id },
        take: 50,
        orderBy: { id: "desc" },
        include: {
          subscriber: {
            select: {
              firstName: true,
              lastName: true,
              username: true,
              chatId: true,
            },
          },
        },
      });
      return NextResponse.json({ success: true, data: { broadcast, recentRecipients } });
    },
    { roles: ["admin"] }
  );
}

const actionSchema = z.object({
  action: z.enum(["start", "cancel"]),
});

export async function POST(
  request: NextRequest,
  { params: paramsP }: { params: Promise<{ botId: string; broadcastId: string }> }
) {
  const params = await paramsP;
  return withAuth(
    request,
    async (req) => {
      const body = await req.json().catch(() => null);
      const parsed = actionSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, error: { code: "BAD_INPUT", message: parsed.error.message } },
          { status: 400 }
        );
      }
      if (parsed.data.action === "start") {
        const r = await db.tgBroadcast.updateMany({
          where: { id: params.broadcastId, botId: params.botId, status: "draft" },
          data: { status: "scheduled", scheduledAt: new Date() },
        });
        if (r.count === 0) {
          return NextResponse.json(
            {
              success: false,
              error: { code: "BAD_STATE", message: "Broadcast not in draft state" },
            },
            { status: 400 }
          );
        }
      } else {
        await db.tgBroadcast.updateMany({
          where: {
            id: params.broadcastId,
            botId: params.botId,
            status: { in: ["draft", "scheduled", "sending"] },
          },
          data: { status: "cancelled", finishedAt: new Date() },
        });
      }
      return NextResponse.json({ success: true });
    },
    { roles: ["admin"] }
  );
}
