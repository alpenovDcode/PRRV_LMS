import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-middleware";
import { flowGraphSchema, triggersSchema } from "@/lib/tg/flow-schema";

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
      const flows = await db.tgFlow.findMany({
        where: { botId: params.botId },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          name: true,
          description: true,
          isActive: true,
          totalEntered: true,
          totalCompleted: true,
          updatedAt: true,
          triggers: true,
        },
      });
      return NextResponse.json({ success: true, data: flows });
    },
    { roles: ["admin"] }
  );
}

const createSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  graph: flowGraphSchema,
  triggers: triggersSchema.optional(),
  isActive: z.boolean().optional(),
});

export async function POST(
  request: NextRequest,
  { params: paramsP }: { params: Promise<{ botId: string }> }
) {
  const params = await paramsP;
  return withAuth(
    request,
    async (req) => {
      const body = await req.json().catch(() => null);
      const parsed = createSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, error: { code: "BAD_INPUT", message: parsed.error.message } },
          { status: 400 }
        );
      }
      // Sanity-check graph: every `next` and rule next must reference a known node.
      const nodeIds = new Set(parsed.data.graph.nodes.map((n) => n.id));
      if (!nodeIds.has(parsed.data.graph.startNodeId)) {
        return NextResponse.json(
          {
            success: false,
            error: { code: "BAD_GRAPH", message: "startNodeId is not in nodes" },
          },
          { status: 400 }
        );
      }
      for (const n of parsed.data.graph.nodes) {
        const refs: Array<string | undefined> = [];
        if ("next" in n) refs.push(n.next);
        if (n.type === "wait_reply") refs.push(n.timeoutNext);
        if (n.type === "condition") {
          refs.push(n.defaultNext);
          for (const r of n.rules) refs.push(r.next);
        }
        if (n.type === "http_request") refs.push(n.onError);
        for (const r of refs) {
          if (r && !nodeIds.has(r)) {
            return NextResponse.json(
              {
                success: false,
                error: {
                  code: "BAD_GRAPH",
                  message: `node "${n.id}" references unknown node "${r}"`,
                },
              },
              { status: 400 }
            );
          }
        }
      }
      const flow = await db.tgFlow.create({
        data: {
          botId: params.botId,
          name: parsed.data.name,
          description: parsed.data.description,
          graph: parsed.data.graph as object,
          triggers: (parsed.data.triggers ?? []) as object,
          isActive: parsed.data.isActive ?? true,
        },
      });
      return NextResponse.json({ success: true, data: { id: flow.id } });
    },
    { roles: ["admin"] }
  );
}
