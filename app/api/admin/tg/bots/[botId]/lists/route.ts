// CRUD for TgList. Lists are named buckets used for broadcast
// targeting and as a trigger source (`list_joined` / `list_left`).

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-middleware";

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
      const lists = await db.tgList.findMany({
        where: { botId: params.botId },
        orderBy: [{ memberCount: "desc" }, { name: "asc" }],
      });
      return NextResponse.json({ success: true, data: { lists } });
    },
    { roles: ["admin"] }
  );
}

const createSchema = z.object({
  name: z.string().min(1).max(120),
  icon: z.string().max(8).optional(),
  description: z.string().max(500).optional(),
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
          { success: false, error: { code: "VALIDATION", message: parsed.error.message } },
          { status: 400 }
        );
      }
      try {
        const created = await db.tgList.create({
          data: { botId: params.botId, ...parsed.data },
        });
        return NextResponse.json({ success: true, data: created });
      } catch (e: any) {
        if (e?.code === "P2002") {
          return NextResponse.json(
            { success: false, error: { code: "CONFLICT", message: "Список с таким именем уже есть" } },
            { status: 409 }
          );
        }
        throw e;
      }
    },
    { roles: ["admin"] }
  );
}
