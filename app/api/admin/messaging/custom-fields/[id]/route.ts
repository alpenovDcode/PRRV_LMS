import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { UserRole } from "@prisma/client";
import { z } from "zod";

const patchSchema = z.object({
  label: z.string().min(1).max(100).optional(),
  options: z.array(z.string().max(100)).max(50).optional(),
  required: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

/** PATCH /api/admin/messaging/custom-fields/[id] */
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
      const field = await db.messagingCustomField.update({
        where: { id },
        data: parsed.data,
      });
      return NextResponse.json({ success: true, data: field });
    },
    { roles: [UserRole.admin] }
  );
}

/** DELETE /api/admin/messaging/custom-fields/[id] */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    req,
    async () => {
      const { id } = await params;
      await db.messagingCustomField.delete({ where: { id } });
      return NextResponse.json({ success: true });
    },
    { roles: [UserRole.admin] }
  );
}
