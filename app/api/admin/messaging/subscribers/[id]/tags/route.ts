import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { UserRole } from "@prisma/client";
import { z } from "zod";

const schema = z.object({ tag: z.string().min(1).max(64) });

/**
 * POST /api/admin/messaging/subscribers/[id]/tags  { tag }
 * Добавить тег подписчику (идемпотентно).
 *
 * DELETE /api/admin/messaging/subscribers/[id]/tags  { tag }
 * Убрать тег.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    req,
    async () => {
      const { id } = await params;
      const body = await req.json().catch(() => ({}));
      const parsed = schema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, error: "Укажите тег" },
          { status: 400 }
        );
      }
      const tag = parsed.data.tag.trim();
      const sub = await db.messagingSubscriber.findUnique({
        where: { id },
        select: { tags: true },
      });
      if (!sub) {
        return NextResponse.json(
          { success: false, error: "Подписчик не найден" },
          { status: 404 }
        );
      }
      const tags = sub.tags.includes(tag) ? sub.tags : [...sub.tags, tag];
      await db.messagingSubscriber.update({ where: { id }, data: { tags } });
      return NextResponse.json({ success: true, data: { tags } });
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    req,
    async () => {
      const { id } = await params;
      const body = await req.json().catch(() => ({}));
      const parsed = schema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, error: "Укажите тег" },
          { status: 400 }
        );
      }
      const tag = parsed.data.tag.trim();
      const sub = await db.messagingSubscriber.findUnique({
        where: { id },
        select: { tags: true },
      });
      if (!sub) {
        return NextResponse.json(
          { success: false, error: "Подписчик не найден" },
          { status: 404 }
        );
      }
      const tags = sub.tags.filter((t) => t !== tag);
      await db.messagingSubscriber.update({ where: { id }, data: { tags } });
      return NextResponse.json({ success: true, data: { tags } });
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}
