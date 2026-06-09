import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recordEvent, EVENT_TYPES } from "@/lib/messaging/events";
import { startFlow } from "@/lib/messaging/engine/runner";
import { MessagingTriggerType } from "@prisma/client";

/**
 * GET /m/[slug]?s=<subscriberId>
 *
 * Tracking-редирект. Записывает клик и редиректит на targetUrl.
 * Если в query есть s=<subscriberId> и slug-link настроен на этого бота —
 * также добавляет attachTag подписчику и эмитит событие.
 *
 * Ссылку формируем в воронке через template:
 *   {{NEXT_PUBLIC_APP_URL}}/m/promo?s={{subscriber.id}}
 *
 * Для анонимных кликов (без ?s=) тоже считаем количество кликов —
 * пригодится для оценки рекламы.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const url = new URL(req.url);
  const subscriberIdParam = url.searchParams.get("s");

  const link = await db.messagingTrackingLink.findUnique({ where: { slug } });
  if (!link) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Best-effort метрики — не блокируем редирект на их ошибки.
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null;
  const userAgent = req.headers.get("user-agent") ?? null;
  const referer = req.headers.get("referer") ?? null;

  // Проверим что subscriber принадлежит этому боту (защита от подмены ?s=)
  let validSubscriberId: string | null = null;
  if (subscriberIdParam) {
    const sub = await db.messagingSubscriber.findUnique({
      where: { id: subscriberIdParam },
      select: { id: true, botId: true, tags: true },
    });
    if (sub && sub.botId === link.botId) {
      validSubscriberId = sub.id;

      // Атрибуция: добавим тег и сохраним lastClickedSlug в variables
      if (link.attachTag && !sub.tags.includes(link.attachTag)) {
        await db.messagingSubscriber
          .update({
            where: { id: sub.id },
            data: { tags: { push: link.attachTag } },
          })
          .catch(() => {});
        await recordEvent({
          botId: link.botId,
          type: EVENT_TYPES.TAG_ADDED,
          subscriberId: sub.id,
          data: { tag: link.attachTag, source: `tracking:${slug}` },
        });
      }
    }
  }

  await db.messagingTrackingClick
    .create({
      data: {
        linkId: link.id,
        subscriberId: validSubscriberId,
        ip,
        userAgent,
        referer,
      },
    })
    .catch(() => {});

  await db.messagingTrackingLink
    .update({
      where: { id: link.id },
      data: { clickCount: { increment: 1 } },
    })
    .catch(() => {});

  // ── link_clicked-триггеры: SaleBot-аналог «link_was_pressed <URL>» ──
  // Если у этого бота есть триггеры типа link_clicked с конкретной
  // ссылкой или wildcard'ом — запустим их воронки. Только когда клик
  // совершил идентифицированный подписчик (без ?s= тригернуть некого).
  if (validSubscriberId) {
    try {
      const triggers = await db.messagingTrigger.findMany({
        where: {
          type: MessagingTriggerType.link_clicked,
          // trackingLinkId либо точно совпадает с этой ссылкой, либо NULL =
          // «любая ссылка этого бота» (но при NULL нужно ещё проверить
          // что flow привязан именно к этому боту — делаем include).
          OR: [
            { trackingLinkId: link.id },
            { trackingLinkId: null },
          ],
          flow: { botId: link.botId, isActive: true },
        },
        select: { id: true, flowId: true, trackingLinkId: true },
      });
      for (const t of triggers) {
        startFlow({
          flowId: t.flowId,
          subscriberId: validSubscriberId,
          initialContext: {
            trigger: "link_clicked",
            triggerId: t.id,
            trackingLinkId: link.id,
            trackingSlug: slug,
            targetUrl: link.targetUrl,
          },
        }).catch((e) => {
          console.warn(
            `[tracking-redirect] startFlow failed for trigger ${t.id}:`,
            e
          );
        });
        db.messagingTrigger
          .update({
            where: { id: t.id },
            data: {
              triggerCount: { increment: 1 },
              lastTriggeredAt: new Date(),
            },
          })
          .catch(() => {});
      }
    } catch (e) {
      // Запуск триггеров не должен валить redirect — клиент уже должен
      // уйти на targetUrl.
      console.warn("[tracking-redirect] link_clicked triggers failed:", e);
    }
  }

  return NextResponse.redirect(link.targetUrl, 302);
}
