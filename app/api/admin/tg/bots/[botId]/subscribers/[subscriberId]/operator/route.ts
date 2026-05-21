import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-middleware";
import { trackEvent } from "@/lib/tg/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const actionSchema = z.object({
  action: z.enum(["takeover", "release"]),
});

// POST { action: "takeover" | "release" } — переключение режима оператора.
// «takeover» — взять диалог: бот перестаёт реагировать триггерами и
// доставлять reply в wait_reply, чтобы оператор мог общаться без помех.
// «release» — вернуть бота в работу: очищаем поля takeover.
export async function POST(
  request: NextRequest,
  {
    params: paramsP,
  }: { params: Promise<{ botId: string; subscriberId: string }> }
) {
  const params = await paramsP;
  return withAuth(
    request,
    async (req) => {
      const body = await req.json().catch(() => null);
      const parsed = actionSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          {
            success: false,
            error: { code: "BAD_INPUT", message: parsed.error.message },
          },
          { status: 400 }
        );
      }
      const sub = await db.tgSubscriber.findFirst({
        where: { id: params.subscriberId, botId: params.botId },
        select: { id: true },
      });
      if (!sub) {
        return NextResponse.json(
          { success: false, error: { code: "NOT_FOUND", message: "Subscriber not found" } },
          { status: 404 }
        );
      }

      const updated = await db.tgSubscriber.update({
        where: { id: sub.id },
        data:
          parsed.data.action === "takeover"
            ? {
                operatorTakeoverAt: new Date(),
                operatorAssigneeId: req.user?.userId ?? null,
              }
            : {
                operatorTakeoverAt: null,
                operatorAssigneeId: null,
              },
        select: {
          operatorTakeoverAt: true,
          operatorAssigneeId: true,
        },
      });

      trackEvent({
        type:
          parsed.data.action === "takeover"
            ? "operator.takeover"
            : "operator.release",
        botId: params.botId,
        subscriberId: sub.id,
        properties: { operatorUserId: req.user?.userId ?? null },
      }).catch(() => {});

      return NextResponse.json({
        success: true,
        data: {
          operatorTakeoverAt:
            updated.operatorTakeoverAt?.toISOString() ?? null,
          operatorAssigneeId: updated.operatorAssigneeId,
        },
      });
    },
    { roles: ["admin"] }
  );
}
