import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-middleware";
import { mergeSubscribers } from "@/lib/tg/merge-subscribers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const mergeSchema = z.object({
  primaryId: z.string().min(1),
  secondaryIds: z.array(z.string().min(1)).min(1).max(20),
});

// POST — выполнить merge. См. /lib/tg/merge-subscribers.ts.
export async function POST(
  request: NextRequest,
  { params: paramsP }: { params: Promise<{ botId: string }> }
) {
  const params = await paramsP;
  return withAuth(
    request,
    async (req) => {
      const body = await req.json().catch(() => null);
      const parsed = mergeSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, error: { code: "BAD_INPUT", message: parsed.error.message } },
          { status: 400 }
        );
      }
      try {
        const result = await mergeSubscribers({
          botId: params.botId,
          primaryId: parsed.data.primaryId,
          secondaryIds: parsed.data.secondaryIds,
        });
        return NextResponse.json({ success: true, data: result });
      } catch (e) {
        return NextResponse.json(
          {
            success: false,
            error: { code: "MERGE_FAILED", message: String(e) },
          },
          { status: 500 }
        );
      }
    },
    { roles: ["admin"] }
  );
}

// GET ?q=… — поиск кандидатов-дубликатов. Возвращает группы подписчиков
// с одинаковым username/именем/телефоном/email/etc.
export async function GET(
  request: NextRequest,
  { params: paramsP }: { params: Promise<{ botId: string }> }
) {
  const params = await paramsP;
  return withAuth(
    request,
    async () => {
      const url = new URL(request.url);
      const q = url.searchParams.get("q")?.trim();

      // Если q задан — отдаём список совпадений по этой строке.
      if (q) {
        const items = await db.tgSubscriber.findMany({
          where: {
            botId: params.botId,
            OR: [
              { firstName: { contains: q, mode: "insensitive" } },
              { lastName: { contains: q, mode: "insensitive" } },
              { username: { contains: q, mode: "insensitive" } },
              { chatId: { contains: q } },
            ],
          },
          orderBy: { subscribedAt: "asc" },
          take: 50,
          select: {
            id: true,
            chatId: true,
            firstName: true,
            lastName: true,
            username: true,
            tags: true,
            isBlocked: true,
            subscribedAt: true,
            lastSeenAt: true,
            customFields: true,
          },
        });
        return NextResponse.json({ success: true, data: { items } });
      }

      // Без q — автодетект групп возможных дублей: один и тот же username
      // или одинаковая нормализованная phone в customFields.
      const groups = await db.$queryRaw<
        Array<{ key: string; ids: string[]; count: bigint }>
      >`
        SELECT
          ('username:' || lower(username)) AS key,
          array_agg(id ORDER BY subscribed_at) AS ids,
          COUNT(*)::bigint AS count
        FROM tg_subscribers
        WHERE bot_id = ${params.botId}
          AND username IS NOT NULL
          AND username <> ''
        GROUP BY 1
        HAVING COUNT(*) > 1
        ORDER BY count DESC
        LIMIT 100
      `;

      const flatIds = groups.flatMap((g) => g.ids);
      const detail = await db.tgSubscriber.findMany({
        where: { id: { in: flatIds } },
        select: {
          id: true,
          chatId: true,
          firstName: true,
          lastName: true,
          username: true,
          tags: true,
          isBlocked: true,
          subscribedAt: true,
          lastSeenAt: true,
        },
      });
      const detailMap = new Map(detail.map((d) => [d.id, d]));

      return NextResponse.json({
        success: true,
        data: {
          groups: groups.map((g) => ({
            key: g.key,
            members: g.ids.map((id) => detailMap.get(id)).filter(Boolean),
          })),
        },
      });
    },
    { roles: ["admin"] }
  );
}
