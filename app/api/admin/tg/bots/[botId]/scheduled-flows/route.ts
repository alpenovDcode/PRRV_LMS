import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-middleware";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const filterSchema = z
  .object({
    allActive: z.boolean().optional(),
    tagsAny: z.array(z.string()).optional(),
    tagsAll: z.array(z.string()).optional(),
    excludeTags: z.array(z.string()).optional(),
    subscriberIds: z.array(z.string()).optional(),
  })
  .default({});

const createSchema = z.object({
  flowId: z.string().min(1),
  name: z.string().min(1).max(200),
  // ISO-8601, например "2026-06-01T07:00:00Z" (UTC). UI должна отдавать
  // именно UTC — пользовательский timezone бота применяется при показе.
  scheduledAt: z.string().refine((s) => !isNaN(new Date(s).getTime()), {
    message: "Некорректная дата",
  }),
  filter: filterSchema,
});

// GET — список запланированных запусков (новые сверху)
export async function GET(
  request: NextRequest,
  { params: paramsP }: { params: Promise<{ botId: string }> }
) {
  const params = await paramsP;
  return withAuth(
    request,
    async () => {
      const list = await db.tgScheduledFlow.findMany({
        where: { botId: params.botId },
        orderBy: [{ status: "asc" }, { scheduledAt: "desc" }],
        take: 200,
      });
      const flowIds = Array.from(new Set(list.map((s) => s.flowId)));
      const flows = await db.tgFlow.findMany({
        where: { id: { in: flowIds } },
        select: { id: true, name: true },
      });
      const flowMap = new Map(flows.map((f) => [f.id, f.name]));
      return NextResponse.json({
        success: true,
        data: {
          items: list.map((s) => ({
            id: s.id,
            flowId: s.flowId,
            flowName: flowMap.get(s.flowId) ?? "(удалён)",
            name: s.name,
            filter: s.filter,
            scheduledAt: s.scheduledAt.toISOString(),
            status: s.status,
            startedAt: s.startedAt?.toISOString() ?? null,
            finishedAt: s.finishedAt?.toISOString() ?? null,
            totalLaunched: s.totalLaunched,
            totalFailed: s.totalFailed,
            lastError: s.lastError,
            createdAt: s.createdAt.toISOString(),
          })),
        },
      });
    },
    { roles: ["admin"] }
  );
}

// POST — создать новый scheduled-flow
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
          {
            success: false,
            error: { code: "BAD_INPUT", message: parsed.error.message },
          },
          { status: 400 }
        );
      }
      const { flowId, name, scheduledAt, filter } = parsed.data;
      const scheduledDate = new Date(scheduledAt);

      if (scheduledDate.getTime() <= Date.now() + 10_000) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "PAST_DATE",
              message: "Дата запуска должна быть в будущем (минимум +10 секунд)",
            },
          },
          { status: 400 }
        );
      }

      const flow = await db.tgFlow.findFirst({
        where: { id: flowId, botId: params.botId },
        select: { id: true, isActive: true },
      });
      if (!flow) {
        return NextResponse.json(
          { success: false, error: { code: "NOT_FOUND", message: "Flow not found" } },
          { status: 404 }
        );
      }

      const created = await db.tgScheduledFlow.create({
        data: {
          botId: params.botId,
          flowId,
          name,
          filter,
          scheduledAt: scheduledDate,
          status: "scheduled",
          createdById: req.user?.userId ?? null,
        },
      });
      return NextResponse.json({ success: true, data: { id: created.id } });
    },
    { roles: ["admin"] }
  );
}
