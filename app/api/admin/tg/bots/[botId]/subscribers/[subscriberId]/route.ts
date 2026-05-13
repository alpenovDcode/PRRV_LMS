import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-middleware";
import { sendBotMessage } from "@/lib/tg/sender";
import { startFlowRun } from "@/lib/tg/flow-engine";
import { messagePayloadSchema } from "@/lib/tg/flow-schema";
import type { Prisma } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params: paramsP }: { params: Promise<{ botId: string; subscriberId: string }> }
) {
  const params = await paramsP;
  return withAuth(
    request,
    async () => {
      const sub = await db.tgSubscriber.findFirst({
        where: { id: params.subscriberId, botId: params.botId },
      });
      if (!sub) {
        return NextResponse.json(
          { success: false, error: { code: "NOT_FOUND", message: "Subscriber not found" } },
          { status: 404 }
        );
      }
      const recentMessages = await db.tgMessage.findMany({
        where: { subscriberId: sub.id },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
      const activeRuns = await db.tgFlowRun.findMany({
        where: {
          subscriberId: sub.id,
          status: { in: ["queued", "running", "sleeping", "waiting_reply"] },
        },
        include: { flow: { select: { name: true } } },
      });
      return NextResponse.json({
        success: true,
        data: { subscriber: sub, messages: recentMessages, activeRuns },
      });
    },
    { roles: ["admin"] }
  );
}

const patchSchema = z.object({
  addTags: z.array(z.string()).optional(),
  removeTags: z.array(z.string()).optional(),
  setVariables: z.record(z.string(), z.unknown()).optional(),
  // Imperative actions:
  sendMessage: messagePayloadSchema.optional(),
  startFlowId: z.string().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params: paramsP }: { params: Promise<{ botId: string; subscriberId: string }> }
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
      const sub = await db.tgSubscriber.findFirst({
        where: { id: params.subscriberId, botId: params.botId },
      });
      if (!sub) {
        return NextResponse.json(
          { success: false, error: { code: "NOT_FOUND", message: "Subscriber not found" } },
          { status: 404 }
        );
      }

      const tagSet = new Set(sub.tags);
      for (const t of parsed.data.addTags ?? []) tagSet.add(t);
      for (const t of parsed.data.removeTags ?? []) tagSet.delete(t);
      const newVars = {
        ...((sub.variables ?? {}) as Record<string, unknown>),
        ...(parsed.data.setVariables ?? {}),
      };
      const updated = await db.tgSubscriber.update({
        where: { id: sub.id },
        data: {
          tags: Array.from(tagSet),
          variables: newVars as Prisma.InputJsonValue,
        },
      });

      // Side actions: send a manual message, start a flow.
      if (parsed.data.sendMessage) {
        const bot = await db.tgBot.findUnique({ where: { id: params.botId } });
        if (bot) {
          await sendBotMessage({
            botId: bot.id,
            encryptedToken: bot.tokenEncrypted,
            subscriberId: sub.id,
            chatId: sub.chatId,
            payload: parsed.data.sendMessage,
            renderCtx: {
              subscriber: {
                chatId: sub.chatId,
                firstName: sub.firstName,
                lastName: sub.lastName,
                username: sub.username,
                variables: newVars,
              },
              bot: { username: bot.username, title: bot.title },
              runContext: {},
            },
            sourceType: "manual",
          });
        }
      }
      if (parsed.data.startFlowId) {
        await startFlowRun({
          flowId: parsed.data.startFlowId,
          subscriberId: sub.id,
          triggerInfo: { triggerType: "manual_api" },
        });
      }

      return NextResponse.json({ success: true, data: updated });
    },
    { roles: ["admin"] }
  );
}
