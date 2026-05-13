import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-middleware";
import type { Prisma } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  q: z.string().optional(),
  tag: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  blocked: z.enum(["true", "false", "all"]).optional(),
});

export async function GET(
  request: NextRequest,
  { params: paramsP }: { params: Promise<{ botId: string }> }
) {
  const params = await paramsP;
  return withAuth(
    request,
    async (req) => {
      const url = new URL(req.url);
      const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, error: { code: "BAD_QUERY", message: parsed.error.message } },
          { status: 400 }
        );
      }
      const { q, tag, page, pageSize, blocked } = parsed.data;

      const where: Prisma.TgSubscriberWhereInput = { botId: params.botId };
      if (blocked === "true") where.isBlocked = true;
      if (blocked === "false") where.isBlocked = false;
      if (tag) where.tags = { has: tag };
      if (q) {
        where.OR = [
          { firstName: { contains: q, mode: "insensitive" } },
          { lastName: { contains: q, mode: "insensitive" } },
          { username: { contains: q, mode: "insensitive" } },
          { chatId: { contains: q } },
        ];
      }

      const [total, subscribers] = await Promise.all([
        db.tgSubscriber.count({ where }),
        db.tgSubscriber.findMany({
          where,
          orderBy: { subscribedAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
          select: {
            id: true,
            chatId: true,
            firstName: true,
            lastName: true,
            username: true,
            tags: true,
            isBlocked: true,
            lastSeenAt: true,
            subscribedAt: true,
            firstTouchSlug: true,
          },
        }),
      ]);

      return NextResponse.json({
        success: true,
        data: { items: subscribers, total, page, pageSize },
      });
    },
    { roles: ["admin"] }
  );
}
