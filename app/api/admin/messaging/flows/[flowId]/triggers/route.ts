import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { UserRole } from "@prisma/client";
import { z } from "zod";

const createSchema = z.object({
  type: z.enum([
    "keyword_dm",
    "keyword_comment",
    "story_reply",
    "mention",
    "subscriber_joined",
    "manual",
  ]),
  keywords: z.array(z.string().min(1).max(200)).max(50).default([]),
  matchType: z.enum(["exact", "contains", "regex", "starts_with"]).default("contains"),
  caseSensitive: z.boolean().default(false),
  mediaIds: z.array(z.string()).max(20).default([]),
});

/** POST /api/admin/messaging/flows/[flowId]/triggers — добавить триггер */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ flowId: string }> }
) {
  return withAuth(
    req,
    async () => {
      const { flowId } = await params;
      const body = await req.json();
      const parsed = createSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ success: false, error: "Некорректные данные" }, { status: 400 });
      }
      const trigger = await db.messagingTrigger.create({
        data: { flowId, ...parsed.data },
      });
      return NextResponse.json({ success: true, data: trigger }, { status: 201 });
    },
    { roles: [UserRole.admin] }
  );
}
