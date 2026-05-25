import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { UserRole } from "@prisma/client";
import { z } from "zod";

const patchSchema = z.object({
  keywords: z.array(z.string().min(1).max(200)).max(50).optional(),
  matchType: z.enum(["exact", "contains", "regex", "starts_with"]).optional(),
  caseSensitive: z.boolean().optional(),
  mediaIds: z.array(z.string()).max(20).optional(),
});

/** PATCH /api/admin/messaging/triggers/[triggerId] */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ triggerId: string }> }
) {
  return withAuth(
    req,
    async () => {
      const { triggerId } = await params;
      const body = await req.json();
      const parsed = patchSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ success: false, error: "Некорректные данные" }, { status: 400 });
      }
      const trigger = await db.messagingTrigger.update({
        where: { id: triggerId },
        data: parsed.data,
      });
      return NextResponse.json({ success: true, data: trigger });
    },
    { roles: [UserRole.admin] }
  );
}

/** DELETE /api/admin/messaging/triggers/[triggerId] */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ triggerId: string }> }
) {
  return withAuth(
    req,
    async () => {
      const { triggerId } = await params;
      await db.messagingTrigger.delete({ where: { id: triggerId } });
      return NextResponse.json({ success: true });
    },
    { roles: [UserRole.admin] }
  );
}
