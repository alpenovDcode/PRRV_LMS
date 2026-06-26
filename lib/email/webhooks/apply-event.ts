import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import type { EmailEventData } from "@/lib/email/providers/types";
import { getMarketingEmailProvider } from "@/lib/email/providers/factory";

/**
 * Применяет одно нормализованное событие провайдера к нашему БД-слою.
 *
 * Шаги:
 *   1. Дедуп по providerEventId — если уже видели, тихо пропускаем.
 *   2. Резолвим связанного получателя (recipientId/userId/campaignId).
 *   3. ОДНОЙ ТРАНЗАКЦИЕЙ:
 *        - создаём EmailEvent
 *        - обновляем BroadcastRecipient (если есть)
 *        - обновляем EmailDeliveryJob.providerMessageId (если есть)
 *        - проставляем User.marketingOptOut при hard-bounce/spam/unsubscribed
 *
 *   Транзакция критична: webhook от провайдера может прислать "bounced",
 *   мы создаём EmailEvent и должны атомарно перевести User в suppression.
 *   Если процесс упадёт между этими двумя — мы будем дальше отправлять
 *   письма на мёртвый адрес, портя репутацию.
 *
 * Идемпотентность: дедуп через @unique providerEventId на EmailEvent.
 * При параллельных вебхуках с одним providerEventId второй транзакционно
 * откатится с P2002 (unique violation) — обрабатываем как duplicate.
 */

export interface ApplyResult {
  inserted: boolean;
  reason?: "duplicate" | "no_match";
}

export async function applyEmailEvent(event: EmailEventData): Promise<ApplyResult> {
  // 1. Pre-check дедупа (быстрый short-circuit без транзакции).
  if (event.providerEventId) {
    const existing = await db.emailEvent.findUnique({
      where: { providerEventId: event.providerEventId },
      select: { id: true },
    });
    if (existing) return { inserted: false, reason: "duplicate" };
  }

  // 2. Резолв получателя — это read-only.
  const recipient = await resolveRecipient(event.email);

  // 3. Атомарный insert + side-effects.
  const shouldSuppress =
    !!recipient?.userId &&
    (event.type === "spam" ||
      (event.type === "bounced" && (event.metadata?.bounceType ?? "hard") === "hard") ||
      event.type === "unsubscribed");

  const broadcastUpdate = recipient?.recipientKind === "broadcast"
    ? buildBroadcastRecipientUpdate(event)
    : null;

  const deliveryUpdate =
    recipient?.recipientKind === "delivery_job" &&
    event.providerEventId &&
    event.type === "delivered"
      ? event.providerEventId.replace(/^delivered:/, "")
      : null;

  try {
    await db.$transaction(async (tx) => {
      await tx.emailEvent.create({
        data: {
          userId: recipient?.userId ?? null,
          email: event.email,
          campaignId: recipient?.campaignId ?? null,
          recipientId: recipient?.recipientId ?? null,
          type: event.type,
          url: event.url ?? null,
          providerEventId: event.providerEventId ?? null,
          metadata: event.metadata
            ? (event.metadata as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          occurredAt: event.occurredAt ?? new Date(),
        },
      });

      if (broadcastUpdate && recipient?.recipientId) {
        // updateMany не кидает NotFound — если запись пропала между resolve и
        // update, просто 0 affected, транзакция продолжается.
        await tx.broadcastRecipient.updateMany({
          where: { id: recipient.recipientId },
          data: broadcastUpdate,
        });
      }

      if (deliveryUpdate && recipient?.recipientId) {
        await tx.emailDeliveryJob.updateMany({
          where: { id: recipient.recipientId },
          data: { providerMessageId: deliveryUpdate },
        });
      }

      if (shouldSuppress && recipient?.userId) {
        await tx.user.updateMany({
          where: { id: recipient.userId },
          data: {
            marketingOptOut: true,
            unsubscribedAt: new Date(),
          },
        });
      }
    });
  } catch (e) {
    // P2002 на providerEventId — гонка с другим webhook handler'ом. Считаем
    // duplicate, не падаем.
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      return { inserted: false, reason: "duplicate" };
    }
    throw e;
  }

  // Suppression sync: если перевели юзера в marketingOptOut — fire-and-forget
  // дёргаем provider.unsubscribeContact чтобы провайдер тоже исключил адрес
  // из своих рассылок. Это критично в bulk-режиме: иначе провайдер
  // продолжит лить письма из других кампаний.
  // Защита от рекурсии: если триггер был "unsubscribed" ОТ провайдера —
  // не дёргаем его в ответ. Признак — наличие providerEventId.
  if (shouldSuppress && !event.providerEventId) {
    syncSuppressionToProvider(event.email).catch((e) =>
      console.warn(`[apply-event] suppression sync failed for ${event.email}:`, e)
    );
  }

  return { inserted: true };
}

/**
 * Fire-and-forget вызов provider.unsubscribeContact. Используется чтобы наша
 * suppression list (отписки/hard-bounce/spam) пушилась в провайдер.
 */
async function syncSuppressionToProvider(email: string): Promise<void> {
  const provider = getMarketingEmailProvider();
  if (typeof provider.unsubscribeContact !== "function") return;
  await provider.unsubscribeContact(email);
}

interface ResolvedRecipient {
  userId: string | null;
  campaignId: string | null;
  recipientId: string | null;
  recipientKind: "delivery_job" | "broadcast";
}

async function resolveRecipient(email: string): Promise<ResolvedRecipient | null> {
  const job = await db.emailDeliveryJob.findFirst({
    where: { email, status: { in: ["sent", "retrying", "pending", "sending"] } },
    orderBy: { sentAt: "desc" },
    select: { id: true, userId: true, campaignId: true },
  });
  if (job) {
    return {
      userId: job.userId,
      campaignId: job.campaignId,
      recipientId: job.id,
      recipientKind: "delivery_job",
    };
  }

  const br = await db.broadcastRecipient.findFirst({
    where: { email },
    orderBy: { createdAt: "desc" },
    select: { id: true, userId: true },
  });
  if (br) {
    return {
      userId: br.userId,
      campaignId: null,
      recipientId: br.id,
      recipientKind: "broadcast",
    };
  }

  return null;
}

function buildBroadcastRecipientUpdate(event: EmailEventData): Record<string, unknown> | null {
  const data: Record<string, unknown> = {};
  const occurredAt = event.occurredAt ?? new Date();
  switch (event.type) {
    case "delivered":
      data.deliveredAt = occurredAt;
      break;
    case "bounced":
      data.bouncedAt = occurredAt;
      data.bounceType = (event.metadata?.bounceType as string) ?? "hard";
      data.bounceReason = ((event.metadata?.reason as string) ?? "").slice(0, 500) || null;
      break;
    case "spam":
      data.spamReportedAt = occurredAt;
      break;
    case "unsubscribed":
      data.unsubscribedAt = occurredAt;
      break;
    default:
      break;
  }
  return Object.keys(data).length > 0 ? data : null;
}
