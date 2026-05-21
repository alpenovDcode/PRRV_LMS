import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-middleware";
import { startFlowRun } from "@/lib/tg/flow-engine";
import { trackEvent } from "@/lib/tg/events";
import type { Prisma } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Жёсткий потолок: даже при «применить ко всему фильтру» не больше 5000
// подписчиков за раз. Иначе долгая транзакция / startFlowRun-storm.
// Если нужно больше — пусть админ повторит запрос или сужает фильтр.
const MAX_AFFECTED = 5000;

const filterSchema = z
  .object({
    q: z.string().optional(),
    tag: z.string().optional(),
    blocked: z.enum(["true", "false", "all"]).optional(),
  })
  .optional();

const bodySchema = z
  .object({
    // Можно передать либо явный список ID, либо фильтр (как в GET /subscribers).
    subscriberIds: z.array(z.string().min(1)).max(MAX_AFFECTED).optional(),
    filter: filterSchema,
    action: z.enum([
      "add_tag",
      "remove_tag",
      "start_flow",
      "block",
      "unblock",
    ]),
    params: z
      .object({
        tag: z.string().min(1).max(64).optional(),
        flowId: z.string().min(1).optional(),
      })
      .optional(),
  })
  .refine((b) => b.subscriberIds || b.filter, {
    message: "Нужен subscriberIds или filter",
  });

function buildWhere(
  botId: string,
  ids: string[] | undefined,
  filter: z.infer<typeof filterSchema>
): Prisma.TgSubscriberWhereInput {
  if (ids && ids.length > 0) {
    return { botId, id: { in: ids } };
  }
  const where: Prisma.TgSubscriberWhereInput = { botId };
  const f = filter ?? {};
  if (f.blocked === "true") where.isBlocked = true;
  if (f.blocked === "false") where.isBlocked = false;
  if (f.tag) where.tags = { has: f.tag };
  if (f.q) {
    where.OR = [
      { firstName: { contains: f.q, mode: "insensitive" } },
      { lastName: { contains: f.q, mode: "insensitive" } },
      { username: { contains: f.q, mode: "insensitive" } },
      { chatId: { contains: f.q } },
    ];
  }
  return where;
}

export async function POST(
  request: NextRequest,
  { params: paramsP }: { params: Promise<{ botId: string }> }
) {
  const params = await paramsP;
  return withAuth(
    request,
    async (req) => {
      const body = await req.json().catch(() => null);
      const parsed = bodySchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          {
            success: false,
            error: { code: "BAD_INPUT", message: parsed.error.message },
          },
          { status: 400 }
        );
      }
      const { subscriberIds, filter, action, params: actionParams } =
        parsed.data;

      // Валидация per-action.
      if (action === "add_tag" || action === "remove_tag") {
        if (!actionParams?.tag) {
          return NextResponse.json(
            {
              success: false,
              error: { code: "MISSING_TAG", message: "Укажите tag" },
            },
            { status: 400 }
          );
        }
      }
      if (action === "start_flow") {
        if (!actionParams?.flowId) {
          return NextResponse.json(
            {
              success: false,
              error: { code: "MISSING_FLOW", message: "Укажите flowId" },
            },
            { status: 400 }
          );
        }
        // Защита от кросс-bot’овых запусков.
        const f = await db.tgFlow.findFirst({
          where: { id: actionParams.flowId, botId: params.botId },
          select: { id: true, isActive: true },
        });
        if (!f) {
          return NextResponse.json(
            {
              success: false,
              error: { code: "FLOW_NOT_FOUND", message: "Flow не найден" },
            },
            { status: 404 }
          );
        }
      }

      // Сначала собираем целевой набор id — ограничен MAX_AFFECTED.
      const where = buildWhere(params.botId, subscriberIds, filter);
      const matchedCount = await db.tgSubscriber.count({ where });
      if (matchedCount > MAX_AFFECTED) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "TOO_MANY",
              message: `Под фильтр попало ${matchedCount} подписчиков, лимит ${MAX_AFFECTED}. Сузьте выборку или повторите частями.`,
            },
          },
          { status: 400 }
        );
      }
      const targets = await db.tgSubscriber.findMany({
        where,
        select: { id: true, tags: true },
      });

      let affected = 0;

      switch (action) {
        case "add_tag": {
          const tag = actionParams!.tag!;
          // Updating arrays in Postgres через Prisma на каждый ряд по
          // одному дешевле, чем set: [...current, tag] с пред-фильтром.
          // updateMany не умеет JSON/array merge, поэтому идём по 100.
          const toUpdate = targets.filter((t) => !t.tags.includes(tag));
          for (let i = 0; i < toUpdate.length; i += 100) {
            const slice = toUpdate.slice(i, i + 100);
            await Promise.all(
              slice.map((s) =>
                db.tgSubscriber.update({
                  where: { id: s.id },
                  data: { tags: { set: [...s.tags, tag] } },
                })
              )
            );
          }
          affected = toUpdate.length;
          break;
        }
        case "remove_tag": {
          const tag = actionParams!.tag!;
          const toUpdate = targets.filter((t) => t.tags.includes(tag));
          for (let i = 0; i < toUpdate.length; i += 100) {
            const slice = toUpdate.slice(i, i + 100);
            await Promise.all(
              slice.map((s) =>
                db.tgSubscriber.update({
                  where: { id: s.id },
                  data: { tags: { set: s.tags.filter((t) => t !== tag) } },
                })
              )
            );
          }
          affected = toUpdate.length;
          break;
        }
        case "block":
        case "unblock": {
          const res = await db.tgSubscriber.updateMany({
            where: { id: { in: targets.map((t) => t.id) } },
            data: {
              isBlocked: action === "block",
              unsubscribedAt: action === "block" ? new Date() : null,
            },
          });
          affected = res.count;
          break;
        }
        case "start_flow": {
          const flowId = actionParams!.flowId!;
          // Запускаем по 50 параллельно, чтобы не утроить рейт-лимиты
          // Telegram’а — реальную отправку будет делать tickRun, но
          // создание самих run’ов всё же лучше дозировать.
          for (let i = 0; i < targets.length; i += 50) {
            const slice = targets.slice(i, i + 50);
            await Promise.all(
              slice.map((s) =>
                startFlowRun({
                  flowId,
                  subscriberId: s.id,
                  triggerInfo: {
                    triggerType: "bulk_action",
                    userId: req.user?.userId ?? null,
                  },
                }).catch(() => null)
              )
            );
          }
          affected = targets.length;
          break;
        }
      }

      trackEvent({
        type: "subscribers.bulk_action",
        botId: params.botId,
        properties: {
          action,
          matched: matchedCount,
          affected,
          userId: req.user?.userId ?? null,
        },
      }).catch(() => {});

      return NextResponse.json({
        success: true,
        data: { matched: matchedCount, affected },
      });
    },
    { roles: ["admin"] }
  );
}
