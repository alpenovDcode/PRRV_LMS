/**
 * app/api/admin/messaging/bots/[id]/scheduled-flows/route.ts
 *
 * CRUD для MessagingScheduledFlow. Аналог
 * /admin/tg/bots/[id]/scheduled-flows.
 *
 * GET   — список расписаний бота, сверху самые свежие.
 * POST  — создать новое расписание.
 *         body: { flowId, name, scheduledAt (ISO), filter? }
 *         scheduledAt должно быть в будущем.
 *         filter — JSON shape ScheduleFilter.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-middleware";
import { UserRole } from "@prisma/client";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const filterSchema = z
  .object({
    allActive: z.boolean().optional(),
    tagsAny: z.array(z.string().min(1).max(64)).max(50).optional(),
    tagsAll: z.array(z.string().min(1).max(64)).max(50).optional(),
    excludeTags: z.array(z.string().min(1).max(64)).max(50).optional(),
    subscriberIds: z.array(z.string().uuid()).max(5000).optional(),
  })
  .strict();

const createSchema = z.object({
  flowId: z.string().uuid(),
  name: z.string().min(1).max(200),
  scheduledAt: z.string().refine((s) => !isNaN(Date.parse(s)), "scheduledAt — ISO timestamp"),
  filter: filterSchema.optional(),
});

export async function GET(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> }
) {
  const params = await paramsP;
  return withAuth(
    req,
    async () => {
      const rows = await db.messagingScheduledFlow.findMany({
        where: { botId: params.id },
        orderBy: [{ status: "asc" }, { scheduledAt: "desc" }],
        take: 200,
      });
      return NextResponse.json({
        success: true,
        data: rows.map((r) => ({
          ...r,
          scheduledAt: r.scheduledAt.toISOString(),
          startedAt: r.startedAt?.toISOString() ?? null,
          finishedAt: r.finishedAt?.toISOString() ?? null,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
        })),
      });
    },
    { roles: [UserRole.admin] }
  );
}

export async function POST(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> }
) {
  const params = await paramsP;
  return withAuth(
    req,
    async (authedReq) => {
      const body = await req.json().catch(() => null);
      const parsed = createSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, error: "Некорректные параметры", details: parsed.error.flatten() },
          { status: 400 }
        );
      }
      const when = new Date(parsed.data.scheduledAt);
      if (when.getTime() <= Date.now() + 5_000) {
        // 5 секунд буфера — пока запрос летит, время не успеет уйти
        return NextResponse.json(
          { success: false, error: "scheduledAt должен быть в будущем" },
          { status: 400 }
        );
      }
      const flow = await db.messagingFlow.findUnique({
        where: { id: parsed.data.flowId },
        select: { id: true, botId: true, isActive: true },
      });
      if (!flow || flow.botId !== params.id) {
        return NextResponse.json(
          { success: false, error: "Воронка не найдена в этом боте" },
          { status: 404 }
        );
      }

      const created = await db.messagingScheduledFlow.create({
        data: {
          botId: params.id,
          flowId: parsed.data.flowId,
          name: parsed.data.name,
          filter: (parsed.data.filter ?? {}) as object,
          scheduledAt: when,
          status: "scheduled",
          createdById: authedReq.user!.userId,
        },
      });

      return NextResponse.json({ success: true, data: created }, { status: 201 });
    },
    { roles: [UserRole.admin] }
  );
}
