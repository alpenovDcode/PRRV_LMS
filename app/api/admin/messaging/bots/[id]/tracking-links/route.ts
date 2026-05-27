import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { UserRole } from "@prisma/client";
import { z } from "zod";

const slugRegex = /^[a-zA-Z0-9_-]+$/;

const createSchema = z.object({
  slug: z.string().min(3).max(80).regex(slugRegex, "Только буквы, цифры, _ и -"),
  targetUrl: z.string().url("Невалидный URL"),
  attachTag: z.string().max(60).nullish(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

/**
 * GET /api/admin/messaging/bots/[id]/tracking-links
 *   Список tracking-ссылок бота с метриками кликов.
 *
 * POST /api/admin/messaging/bots/[id]/tracking-links
 *   Создаёт новую ссылку. slug должен быть уникальным глобально.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    req,
    async () => {
      const { id } = await params;
      const links = await db.messagingTrackingLink.findMany({
        where: { botId: id },
        orderBy: { createdAt: "desc" },
        take: 200,
      });
      return NextResponse.json({ success: true, data: links });
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    req,
    async () => {
      const { id } = await params;
      const body = await req.json().catch(() => null);
      const parsed = createSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, error: parsed.error.issues[0]?.message ?? "Невалидные данные" },
          { status: 400 }
        );
      }
      const data = parsed.data;

      const existing = await db.messagingTrackingLink.findUnique({
        where: { slug: data.slug },
      });
      if (existing) {
        return NextResponse.json(
          { success: false, error: "Такой slug уже используется" },
          { status: 409 }
        );
      }

      const created = await db.messagingTrackingLink.create({
        data: {
          botId: id,
          slug: data.slug,
          targetUrl: data.targetUrl,
          attachTag: data.attachTag ?? null,
          meta: (data.meta ?? null) as any,
        },
      });

      return NextResponse.json({ success: true, data: created });
    },
    { roles: [UserRole.admin] }
  );
}
