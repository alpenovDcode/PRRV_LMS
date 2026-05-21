import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-middleware";
import { flowGraphSchema } from "@/lib/tg/flow-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Какие активные runs пострадают, если PATCH-нуть граф?
// Считаем «застрянут» те, у кого currentNodeId исчез из нового графа —
// они будут принудительно cancelled. Редактор показывает счётчик до
// сохранения, чтобы автор не потерял пользователей по неаккуратности.
const schema = z.object({
  graph: flowGraphSchema,
});

export async function POST(
  request: NextRequest,
  { params: paramsP }: { params: Promise<{ botId: string; flowId: string }> }
) {
  const params = await paramsP;
  return withAuth(
    request,
    async () => {
      const body = await request.json().catch(() => null);
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
      const flow = await db.tgFlow.findFirst({
        where: { id: params.flowId, botId: params.botId },
        select: { id: true },
      });
      if (!flow) {
        return NextResponse.json(
          { success: false, error: { code: "NOT_FOUND", message: "Flow not found" } },
          { status: 404 }
        );
      }
      const newIds = new Set(parsed.data.graph.nodes.map((n) => n.id));
      const active = await db.tgFlowRun.findMany({
        where: {
          flowId: params.flowId,
          status: { in: ["queued", "sleeping", "waiting_reply"] },
        },
        select: { currentNodeId: true, status: true },
      });
      const lost = active.filter(
        (r) => r.currentNodeId && !newIds.has(r.currentNodeId)
      );
      // Группируем для UI: какие именно missing-ноды и сколько на каждой.
      const byMissing = new Map<string, number>();
      for (const r of lost) {
        if (r.currentNodeId) {
          byMissing.set(
            r.currentNodeId,
            (byMissing.get(r.currentNodeId) ?? 0) + 1
          );
        }
      }
      return NextResponse.json({
        success: true,
        data: {
          activeRuns: active.length,
          willCancel: lost.length,
          byMissingNode: Array.from(byMissing.entries()).map(([id, count]) => ({
            nodeId: id,
            count,
          })),
        },
      });
    },
    { roles: ["admin"] }
  );
}
