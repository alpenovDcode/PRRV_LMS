// Per-field operations. We deliberately DON'T cascade-delete values
// from TgSubscriber.customFields when a field schema is removed —
// values stay as orphans in the JSON bag. Sweep them on next save.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-middleware";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  label: z.string().min(1).max(120).optional(),
  description: z.string().max(500).nullable().optional(),
  options: z
    .array(z.object({ value: z.string().min(1), label: z.string().min(1) }))
    .optional(),
  validationRegex: z.string().max(500).nullable().optional(),
  isRequired: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params: paramsP }: { params: Promise<{ botId: string; fieldId: string }> }
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
      const updated = await db.tgCustomField.updateMany({
        where: { id: params.fieldId, botId: params.botId },
        data: parsed.data,
      });
      if (updated.count === 0) {
        return NextResponse.json(
          { success: false, error: { code: "NOT_FOUND" } },
          { status: 404 }
        );
      }
      const fresh = await db.tgCustomField.findUnique({ where: { id: params.fieldId } });
      return NextResponse.json({ success: true, data: fresh });
    },
    { roles: ["admin"] }
  );
}

export async function DELETE(
  request: NextRequest,
  { params: paramsP }: { params: Promise<{ botId: string; fieldId: string }> }
) {
  const params = await paramsP;
  return withAuth(
    request,
    async () => {
      const deleted = await db.tgCustomField.deleteMany({
        where: { id: params.fieldId, botId: params.botId },
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
