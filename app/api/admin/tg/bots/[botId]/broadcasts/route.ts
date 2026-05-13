import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-middleware";
import { messagePayloadSchema } from "@/lib/tg/flow-schema";

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
      const list = await db.tgBroadcast.findMany({
        where: { botId: params.botId },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      return NextResponse.json({ success: true, data: list });
    },
    { roles: ["admin"] }
  );
}

const filterSchema = z.object({
  allActive: z.boolean().optional(),
  tagsAny: z.array(z.string()).optional(),
  tagsAll: z.array(z.string()).optional(),
  excludeTags: z.array(z.string()).optional(),
  subscriberIds: z.array(z.string()).optional(),
});

const createSchema = z.object({
  name: z.string().min(1).max(120),
  message: messagePayloadSchema,
  filter: filterSchema,
  // When true, broadcast transitions draft -> scheduled with scheduledAt=now,
  // so the next cron tick picks it up. When false, stays as draft.
  startNow: z.boolean().optional(),
  scheduledAt: z.coerce.date().optional(),
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
      let status: "draft" | "scheduled" = "draft";
      let scheduledAt: Date | null = null;
      if (parsed.data.startNow) {
        status = "scheduled";
        scheduledAt = new Date();
      } else if (parsed.data.scheduledAt) {
        status = "scheduled";
        scheduledAt = parsed.data.scheduledAt;
      }
      const created = await db.tgBroadcast.create({
        data: {
          botId: params.botId,
          name: parsed.data.name,
          message: parsed.data.message as object,
          filter: parsed.data.filter as object,
          status,
          scheduledAt: scheduledAt ?? undefined,
          createdById: (req as { user?: { userId?: string } }).user?.userId,
        },
      });
      return NextResponse.json({ success: true, data: { id: created.id, status } });
    },
    { roles: ["admin"] }
  );
}
