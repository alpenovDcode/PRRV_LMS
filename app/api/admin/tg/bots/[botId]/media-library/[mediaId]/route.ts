// Per-media-file endpoints: rename + delete (library entry only — the
// bytes stay on Telegram's CDN; we just forget the file_id).

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-middleware";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params: paramsP }: { params: Promise<{ botId: string; mediaId: string }> }
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
      const updated = await db.tgMediaFile.updateMany({
        where: { id: params.mediaId, botId: params.botId },
        data: parsed.data,
      });
      if (updated.count === 0) {
        return NextResponse.json(
          { success: false, error: { code: "NOT_FOUND" } },
          { status: 404 }
        );
      }
      const fresh = await db.tgMediaFile.findUnique({ where: { id: params.mediaId } });
      return NextResponse.json({ success: true, data: fresh });
    },
    { roles: ["admin"] }
  );
}

export async function DELETE(
  request: NextRequest,
  { params: paramsP }: { params: Promise<{ botId: string; mediaId: string }> }
) {
  const params = await paramsP;
  return withAuth(
    request,
    async () => {
      const deleted = await db.tgMediaFile.deleteMany({
        where: { id: params.mediaId, botId: params.botId },
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
