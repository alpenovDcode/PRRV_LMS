import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { UserRole } from "@prisma/client";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1).max(200),
  text: z.string().min(1).max(4000),
  buttons: z.array(z.any()).max(3).optional(),
  filter: z
    .object({
      tags: z.array(z.string()).optional(),
      excludeTags: z.array(z.string()).optional(),
      lists: z.array(z.string()).optional(),
      excludeLists: z.array(z.string()).optional(),
      anyOrAll: z.enum(["any", "all"]).optional(),
    })
    .default({}),
  scheduledAt: z.string().datetime().nullable().optional(),
});

/** GET /api/admin/messaging/bots/[id]/broadcasts */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    req,
    async () => {
      const { id } = await params;
      const broadcasts = await db.messagingBroadcast.findMany({
        where: { botId: id },
        orderBy: { createdAt: "desc" },
      });
      return NextResponse.json({ success: true, data: broadcasts });
    },
    { roles: [UserRole.admin] }
  );
}

/** POST /api/admin/messaging/bots/[id]/broadcasts */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    req,
    async (authedReq) => {
      const { id } = await params;
      const body = await req.json().catch(() => null);
      const parsed = createSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ success: false, error: "Некорректные данные" }, { status: 400 });
      }

      const broadcast = await db.messagingBroadcast.create({
        data: {
          botId: id,
          name: parsed.data.name,
          text: parsed.data.text,
          buttons: parsed.data.buttons as any,
          filter: parsed.data.filter as any,
          scheduledAt: parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : null,
          status: parsed.data.scheduledAt ? "scheduled" : "draft",
          createdById: authedReq.user!.userId,
        },
      });

      return NextResponse.json({ success: true, data: broadcast }, { status: 201 });
    },
    { roles: [UserRole.admin] }
  );
}
