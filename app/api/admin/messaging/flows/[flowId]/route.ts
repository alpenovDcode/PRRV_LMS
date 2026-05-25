import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { UserRole } from "@prisma/client";
import { z } from "zod";

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  isActive: z.boolean().optional(),
  graph: z
    .object({
      startNodeId: z.string(),
      nodes: z.record(z.any()),
    })
    .optional(),
});

/** GET /api/admin/messaging/flows/[flowId] */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ flowId: string }> }
) {
  return withAuth(
    req,
    async () => {
      const { flowId } = await params;
      const flow = await db.messagingFlow.findUnique({
        where: { id: flowId },
        include: {
          triggers: true,
          bot: { select: { id: true, channel: true, title: true } },
          _count: { select: { runs: true } },
        },
      });
      if (!flow) return NextResponse.json({ success: false, error: "Не найдено" }, { status: 404 });
      return NextResponse.json({ success: true, data: flow });
    },
    { roles: [UserRole.admin] }
  );
}

/** PATCH /api/admin/messaging/flows/[flowId] */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ flowId: string }> }
) {
  return withAuth(
    req,
    async () => {
      const { flowId } = await params;
      const body = await req.json();
      const parsed = patchSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ success: false, error: "Некорректные данные" }, { status: 400 });
      }
      const flow = await db.messagingFlow.update({
        where: { id: flowId },
        data: parsed.data as any,
      });
      return NextResponse.json({ success: true, data: flow });
    },
    { roles: [UserRole.admin] }
  );
}

/** DELETE /api/admin/messaging/flows/[flowId] */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ flowId: string }> }
) {
  return withAuth(
    req,
    async () => {
      const { flowId } = await params;
      await db.messagingFlow.delete({ where: { id: flowId } });
      return NextResponse.json({ success: true });
    },
    { roles: [UserRole.admin] }
  );
}
