import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-middleware";
import { flowGraphSchema, triggersSchema } from "@/lib/tg/flow-schema";
import { trackEvent } from "@/lib/tg/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params: paramsP }: { params: Promise<{ botId: string; flowId: string }> }
) {
  const params = await paramsP;
  return withAuth(
    request,
    async () => {
      const flow = await db.tgFlow.findFirst({
        where: { id: params.flowId, botId: params.botId },
      });
      if (!flow) {
        return NextResponse.json(
          { success: false, error: { code: "NOT_FOUND", message: "Flow not found" } },
          { status: 404 }
        );
      }
      const recentRuns = await db.tgFlowRun.findMany({
        where: { flowId: flow.id },
        orderBy: { startedAt: "desc" },
        take: 25,
        include: {
          subscriber: { select: { firstName: true, lastName: true, username: true } },
        },
      });
      return NextResponse.json({ success: true, data: { flow, recentRuns } });
    },
    { roles: ["admin"] }
  );
}

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).optional(),
  graph: flowGraphSchema.optional(),
  triggers: triggersSchema.optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params: paramsP }: { params: Promise<{ botId: string; flowId: string }> }
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
      const data: Record<string, unknown> = {};
      if (parsed.data.name !== undefined) data.name = parsed.data.name;
      if (parsed.data.description !== undefined) data.description = parsed.data.description;
      if (parsed.data.graph !== undefined) data.graph = parsed.data.graph as object;
      if (parsed.data.triggers !== undefined) data.triggers = parsed.data.triggers as object;
      if (parsed.data.isActive !== undefined) data.isActive = parsed.data.isActive;
      await db.tgFlow.updateMany({
        where: { id: params.flowId, botId: params.botId },
        data,
      });

      // Hot-reload: если перезаписали граф, проверяем активные runs у
      // этого флоу — те, у кого currentNodeId больше не существует в
      // новом графе, помечаем cancelled. Иначе они на следующем тике
      // упадут с "node not found" и зашумят логи.
      let cancelledRuns = 0;
      if (parsed.data.graph !== undefined) {
        const newNodeIds = new Set(parsed.data.graph.nodes.map((n) => n.id));
        const stale = await db.tgFlowRun.findMany({
          where: {
            flowId: params.flowId,
            status: { in: ["queued", "sleeping", "waiting_reply"] },
          },
          select: { id: true, currentNodeId: true, subscriberId: true },
        });
        const toCancel = stale.filter(
          (r) => r.currentNodeId && !newNodeIds.has(r.currentNodeId)
        );
        if (toCancel.length > 0) {
          const ids = toCancel.map((r) => r.id);
          await db.tgFlowRun.updateMany({
            where: { id: { in: ids } },
            data: {
              status: "cancelled",
              finishedAt: new Date(),
              lastError: "node removed during hot-reload",
            },
          });
          cancelledRuns = toCancel.length;
          trackEvent({
            type: "flow.hot_reload_cancelled_runs",
            botId: params.botId,
            properties: {
              flowId: params.flowId,
              cancelledRuns,
              missingNodeIds: Array.from(
                new Set(toCancel.map((r) => r.currentNodeId))
              ),
            },
          }).catch(() => {});
        }
      }

      return NextResponse.json({
        success: true,
        data: { cancelledRuns },
      });
    },
    { roles: ["admin"] }
  );
}

export async function DELETE(
  request: NextRequest,
  { params: paramsP }: { params: Promise<{ botId: string; flowId: string }> }
) {
  const params = await paramsP;
  return withAuth(
    request,
    async () => {
      await db.tgFlow.deleteMany({
        where: { id: params.flowId, botId: params.botId },
      });
      return NextResponse.json({ success: true });
    },
    { roles: ["admin"] }
  );
}
