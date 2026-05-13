// Per-list operations: rename, delete, fetch members.
//
// POST /members  — bulk add subscribers (by tg id list)
// DELETE /members — bulk remove

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-middleware";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  icon: z.string().max(8).nullable().optional(),
  description: z.string().max(500).nullable().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params: paramsP }: { params: Promise<{ botId: string; listId: string }> }
) {
  const params = await paramsP;
  return withAuth(
    request,
    async (req) => {
      const body = await req.json().catch(() => null);
      const parsed = patchSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, error: { code: "VALIDATION", message: parsed.error.message } },
          { status: 400 }
        );
      }
      const updated = await db.tgList.updateMany({
        where: { id: params.listId, botId: params.botId },
        data: parsed.data,
      });
      if (updated.count === 0) {
        return NextResponse.json(
          { success: false, error: { code: "NOT_FOUND" } },
          { status: 404 }
        );
      }
      const fresh = await db.tgList.findUnique({ where: { id: params.listId } });
      return NextResponse.json({ success: true, data: fresh });
    },
    { roles: ["admin"] }
  );
}

export async function DELETE(
  request: NextRequest,
  { params: paramsP }: { params: Promise<{ botId: string; listId: string }> }
) {
  const params = await paramsP;
  return withAuth(
    request,
    async () => {
      // Cascade deletes TgSubscriberList rows. We do NOT fire `list_left`
      // triggers for bulk deletes — that's policy ("admin nuked the
      // list" is not a per-user event worth a flow run for each member).
      const deleted = await db.tgList.deleteMany({
        where: { id: params.listId, botId: params.botId },
      });
      if (deleted.count === 0) {
        return NextResponse.json(
          { success: false, error: { code: "NOT_FOUND" } },
          { status: 404 }
        );
      }
      return NextResponse.json({ success: true });
    },
    { roles: ["admin"] }
  );
}
