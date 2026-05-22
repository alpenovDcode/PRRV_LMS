import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-middleware";
import { Prisma } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Список диалогов для мессенджер-вида раздела «Подписчики».
//
// Для каждого подписчика подтягиваем:
//   • lastMessage   — текст/направление/медиа/время последнего сообщения
//   • lastActivityAt — для сортировки (как в Telegram: свежие сверху)
//   • needsReply    — есть входящее без нашего ответа после него
//
// Фильтры: q (имя/username/chatId), tag, needsReply (только ждущие ответа).
// Пагинация — page/pageSize (UI догружает скроллом).

const querySchema = z.object({
  q: z.string().optional(),
  tag: z.string().optional(),
  needsReply: z.enum(["true", "false"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(40),
});

interface ConvRow {
  id: string;
  chat_id: string;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  tags: string[];
  is_blocked: boolean;
  operator_takeover_at: Date | null;
  subscribed_at: Date;
  last_text: string | null;
  last_direction: string | null;
  last_media: string | null;
  last_at: Date | null;
  last_in: Date | null;
  last_out: Date | null;
}

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
      const { q, tag, needsReply, page, pageSize } = parsed.data;
      const botId = params.botId;
      const offset = (page - 1) * pageSize;

      // Сборка WHERE-условий по подписчику.
      const conds: Prisma.Sql[] = [Prisma.sql`s.bot_id = ${botId}`];
      if (q) {
        const like = `%${q}%`;
        conds.push(
          Prisma.sql`(s.first_name ILIKE ${like} OR s.last_name ILIKE ${like} OR s.username ILIKE ${like} OR s.chat_id ILIKE ${like})`
        );
      }
      if (tag) {
        conds.push(Prisma.sql`${tag} = ANY(s.tags)`);
      }
      // needsReply фильтруется по агрегату — добавляем в HAVING-эквивалент
      // через подзапрос ниже (после JOIN’а ma).
      const whereSql = Prisma.join(conds, " AND ");
      const needsReplySql =
        needsReply === "true"
          ? Prisma.sql`AND ma.last_in IS NOT NULL AND (ma.last_out IS NULL OR ma.last_in > ma.last_out)`
          : Prisma.empty;

      // Основной запрос. msg_agg — агрегаты времён, last_msg — DISTINCT ON
      // последнее сообщение каждого подписчика.
      const rows = await db.$queryRaw<ConvRow[]>`
        WITH msg_agg AS (
          SELECT
            subscriber_id,
            MAX(created_at) AS last_at,
            MAX(created_at) FILTER (WHERE direction = 'in') AS last_in,
            MAX(created_at) FILTER (WHERE direction = 'out') AS last_out
          FROM tg_messages
          WHERE bot_id = ${botId}
          GROUP BY subscriber_id
        ),
        last_msg AS (
          SELECT DISTINCT ON (subscriber_id)
            subscriber_id, text, direction, media_type, created_at
          FROM tg_messages
          WHERE bot_id = ${botId}
          ORDER BY subscriber_id, created_at DESC
        )
        SELECT
          s.id, s.chat_id, s.first_name, s.last_name, s.username, s.tags,
          s.is_blocked, s.operator_takeover_at, s.subscribed_at,
          lm.text AS last_text, lm.direction AS last_direction,
          lm.media_type AS last_media,
          ma.last_at, ma.last_in, ma.last_out
        FROM tg_subscribers s
        LEFT JOIN msg_agg ma ON ma.subscriber_id = s.id
        LEFT JOIN last_msg lm ON lm.subscriber_id = s.id
        WHERE ${whereSql}
        ${needsReplySql}
        ORDER BY COALESCE(ma.last_at, s.subscribed_at) DESC
        LIMIT ${pageSize} OFFSET ${offset}
      `;

      // total — для понимания «есть ли ещё страницы».
      const totalRows = await db.$queryRaw<Array<{ cnt: bigint }>>`
        WITH msg_agg AS (
          SELECT
            subscriber_id,
            MAX(created_at) FILTER (WHERE direction = 'in') AS last_in,
            MAX(created_at) FILTER (WHERE direction = 'out') AS last_out
          FROM tg_messages
          WHERE bot_id = ${botId}
          GROUP BY subscriber_id
        )
        SELECT COUNT(*)::bigint AS cnt
        FROM tg_subscribers s
        LEFT JOIN msg_agg ma ON ma.subscriber_id = s.id
        WHERE ${whereSql}
        ${needsReplySql}
      `;
      const total = Number(totalRows[0]?.cnt ?? 0);

      const TAKEOVER_TTL = 24 * 60 * 60 * 1000;
      const items = rows.map((r) => {
        const lastIn = r.last_in?.getTime() ?? null;
        const lastOut = r.last_out?.getTime() ?? null;
        const reqReply =
          lastIn != null && (lastOut == null || lastIn > lastOut);
        const operatorActive =
          !!r.operator_takeover_at &&
          Date.now() - r.operator_takeover_at.getTime() < TAKEOVER_TTL;
        return {
          id: r.id,
          chatId: r.chat_id,
          firstName: r.first_name,
          lastName: r.last_name,
          username: r.username,
          tags: r.tags ?? [],
          isBlocked: r.is_blocked,
          operatorActive,
          subscribedAt: r.subscribed_at.toISOString(),
          lastActivityAt: (r.last_at ?? r.subscribed_at).toISOString(),
          needsReply: reqReply,
          lastMessage: r.last_at
            ? {
                text: r.last_text,
                direction: r.last_direction,
                mediaType: r.last_media,
                createdAt: r.last_at.toISOString(),
              }
            : null,
        };
      });

      return NextResponse.json({
        success: true,
        data: { items, total, page, pageSize },
      });
    },
    { roles: ["admin"] }
  );
}
