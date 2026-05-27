import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { UserRole } from "@prisma/client";
import { z } from "zod";

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  rules: z
    .object({
      tags: z.array(z.string().max(64)).max(20).optional(),
      excludeTags: z.array(z.string().max(64)).max(20).optional(),
      anyOrAll: z.enum(["any", "all"]).default("all"),
    })
    .nullable()
    .optional(),
});

/** GET /api/admin/messaging/lists/[id] */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    req,
    async () => {
      const { id } = await params;
      const list = await db.messagingList.findUnique({
        where: { id },
        include: {
          _count: { select: { members: true } },
        },
      });
      if (!list) return NextResponse.json({ success: false, error: "Не найдено" }, { status: 404 });
      return NextResponse.json({ success: true, data: list });
    },
    { roles: [UserRole.admin] }
  );
}

/** PATCH /api/admin/messaging/lists/[id] */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    req,
    async () => {
      const { id } = await params;
      const body = await req.json().catch(() => null);
      const parsed = patchSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ success: false, error: "Некорректные данные" }, { status: 400 });
      }
      const list = await db.messagingList.update({
        where: { id },
        data: parsed.data as any,
      });
      return NextResponse.json({ success: true, data: list });
    },
    { roles: [UserRole.admin] }
  );
}

/** DELETE /api/admin/messaging/lists/[id] */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    req,
    async () => {
      const { id } = await params;
      await db.messagingList.delete({ where: { id } });
      return NextResponse.json({ success: true });
    },
    { roles: [UserRole.admin] }
  );
}
