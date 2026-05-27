import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { UserRole } from "@prisma/client";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  type: z.enum(["static", "dynamic"]).default("static"),
  /** Для dynamic: { tags: [], excludeTags: [], anyOrAll: "all"|"any" } */
  rules: z
    .object({
      tags: z.array(z.string().max(64)).max(20).optional(),
      excludeTags: z.array(z.string().max(64)).max(20).optional(),
      anyOrAll: z.enum(["any", "all"]).default("all"),
    })
    .optional(),
});

/** GET /api/admin/messaging/bots/[id]/lists */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    req,
    async () => {
      const { id } = await params;
      const lists = await db.messagingList.findMany({
        where: { botId: id },
        orderBy: { createdAt: "desc" },
      });
      return NextResponse.json({ success: true, data: lists });
    },
    { roles: [UserRole.admin] }
  );
}

/** POST /api/admin/messaging/bots/[id]/lists */
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
          { success: false, error: "Некорректные данные" },
          { status: 400 }
        );
      }

      const list = await db.messagingList.create({
        data: {
          botId: id,
          name: parsed.data.name,
          description: parsed.data.description ?? null,
          type: parsed.data.type,
          rules: parsed.data.rules as any,
        },
      });

      // Для dynamic — сразу пересчитываем members по rules
      if (list.type === "dynamic" && parsed.data.rules) {
        await recomputeDynamicList(list.id, id, parsed.data.rules);
      }

      return NextResponse.json({ success: true, data: list }, { status: 201 });
    },
    { roles: [UserRole.admin] }
  );
}

/**
 * Пересчёт члены динамического листа на основе тегов.
 * Простая реализация для MVP: тег-логика.
 */
async function recomputeDynamicList(
  listId: string,
  botId: string,
  rules: { tags?: string[]; excludeTags?: string[]; anyOrAll?: "any" | "all" }
): Promise<void> {
  const includeTags = rules.tags ?? [];
  const excludeTags = rules.excludeTags ?? [];
  const anyOrAll = rules.anyOrAll ?? "all";

  if (includeTags.length === 0 && excludeTags.length === 0) return;

  // Загружаем всех подписчиков бота
  const subscribers = await db.messagingSubscriber.findMany({
    where: { botId },
    select: { id: true, tags: true },
  });

  // Фильтруем
  const matchingIds = subscribers
    .filter((s) => {
      const tags = new Set(s.tags);
      // Exclude — приоритет
      for (const ex of excludeTags) if (tags.has(ex)) return false;
      // Include
      if (includeTags.length === 0) return true;
      if (anyOrAll === "any") return includeTags.some((t) => tags.has(t));
      return includeTags.every((t) => tags.has(t));
    })
    .map((s) => s.id);

  // Удаляем старые auto-членства и создаём новые
  await db.messagingListMember.deleteMany({
    where: { listId, source: "auto" },
  });
  if (matchingIds.length > 0) {
    await db.messagingListMember.createMany({
      data: matchingIds.map((sid) => ({
        listId,
        subscriberId: sid,
        source: "auto",
      })),
      skipDuplicates: true,
    });
  }

  // Обновляем memberCount
  const count = await db.messagingListMember.count({ where: { listId } });
  await db.messagingList.update({ where: { id: listId }, data: { memberCount: count } });
}
