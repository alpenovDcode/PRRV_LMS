import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { UserRole } from "@prisma/client";
import { z } from "zod";

const createFlowSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  graph: z.object({
    startNodeId: z.string(),
    nodes: z.record(z.any()),
  }),
});

/** GET /api/admin/messaging/bots/[id]/flows — список воронок бота */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    req,
    async () => {
      const { id } = await params;
      const flows = await db.messagingFlow.findMany({
        where: { botId: id },
        orderBy: { createdAt: "desc" },
        include: {
          triggers: { select: { id: true, type: true, keywords: true, triggerCount: true } },
          _count: { select: { runs: true } },
        },
      });
      return NextResponse.json({ success: true, data: flows });
    },
    { roles: [UserRole.admin] }
  );
}

/** POST /api/admin/messaging/bots/[id]/flows — создать воронку */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    req,
    async () => {
      const { id } = await params;
      const body = await req.json();
      const parsed = createFlowSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, error: "Некорректный JSON воронки" },
          { status: 400 }
        );
      }

      const bot = await db.messagingBot.findUnique({ where: { id } });
      if (!bot) {
        return NextResponse.json(
          { success: false, error: "Бот не найден" },
          { status: 404 }
        );
      }

      const flow = await db.messagingFlow.create({
        data: {
          botId: id,
          name: parsed.data.name,
          description: parsed.data.description ?? null,
          graph: parsed.data.graph,
        },
      });
      return NextResponse.json({ success: true, data: flow }, { status: 201 });
    },
    { roles: [UserRole.admin] }
  );
}
