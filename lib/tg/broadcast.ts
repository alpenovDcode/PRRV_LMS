// Broadcast worker. Called by the cron-tick endpoint.
//
// Lifecycle of a TgBroadcast:
//   draft       — created in admin UI, not yet sent
//   scheduled   — has scheduled_at, will be picked up when due
//   sending     — recipient rows materialized; worker is processing them
//   completed   — every recipient row resolved
//   cancelled   — manually stopped (worker skips it)
//   failed      — fatal error during materialization (no recipients sent)
//
// Materialization: when a broadcast transitions draft|scheduled -> sending,
// we eagerly create one tg_broadcast_recipients row per subscriber matching
// the filter. From then on, the worker just processes pending rows.

import { db } from "../db";
import { messagePayloadSchema, type FlowMessagePayload } from "./flow-schema";
import { sendBotMessage } from "./sender";
import { trackEvent } from "./events";
import type { TgBot, TgBroadcast, TgSubscriber, Prisma } from "@prisma/client";

interface BroadcastFilter {
  allActive?: boolean;
  tagsAny?: string[];
  tagsAll?: string[];
  excludeTags?: string[];
  subscriberIds?: string[];
}

function buildWhere(botId: string, filter: BroadcastFilter): Prisma.TgSubscriberWhereInput {
  const where: Prisma.TgSubscriberWhereInput = {
    botId,
    isBlocked: false,
  };
  if (filter.subscriberIds && filter.subscriberIds.length > 0) {
    where.id = { in: filter.subscriberIds };
    return where;
  }
  if (filter.tagsAny && filter.tagsAny.length > 0) {
    where.tags = { hasSome: filter.tagsAny };
  }
  if (filter.tagsAll && filter.tagsAll.length > 0) {
    where.tags = { ...(where.tags as object), hasEvery: filter.tagsAll };
  }
  if (filter.excludeTags && filter.excludeTags.length > 0) {
    where.NOT = { tags: { hasSome: filter.excludeTags } };
  }
  return where;
}

async function materializeRecipients(broadcast: TgBroadcast): Promise<number> {
  const filter = (broadcast.filter ?? {}) as BroadcastFilter;
  const where = buildWhere(broadcast.botId, filter);

  // Stream subscribers in pages so we don't hold a giant array in memory.
  const pageSize = 1000;
  let cursor: string | undefined;
  let total = 0;
  while (true) {
    const page = await db.tgSubscriber.findMany({
      where,
      take: pageSize,
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined,
      orderBy: { id: "asc" },
      select: { id: true },
    });
    if (page.length === 0) break;
    await db.tgBroadcastRecipient.createMany({
      data: page.map((s) => ({
        broadcastId: broadcast.id,
        subscriberId: s.id,
        status: "pending",
      })),
      skipDuplicates: true,
    });
    total += page.length;
    cursor = page[page.length - 1]?.id;
    if (page.length < pageSize) break;
  }
  return total;
}

// Bring a single broadcast from draft|scheduled -> sending and materialize.
async function startSending(broadcast: TgBroadcast): Promise<TgBroadcast | null> {
  // Atomically transition status. If another worker beat us to it, abort.
  const claimed = await db.tgBroadcast.updateMany({
    where: { id: broadcast.id, status: { in: ["draft", "scheduled"] } },
    data: { status: "sending", startedAt: new Date() },
  });
  if (claimed.count === 0) return null;
  const total = await materializeRecipients(broadcast);
  const updated = await db.tgBroadcast.update({
    where: { id: broadcast.id },
    data: { totalRecipients: total },
  });
  trackEvent({
    type: "broadcast.started",
    botId: broadcast.botId,
    properties: { broadcastId: broadcast.id, totalRecipients: total },
  }).catch(() => {});
  return updated;
}

interface ProcessOptions {
  // Hard cap on recipients processed per tick across all broadcasts.
  // Default 100 — at ~28 msg/s global TG limit this is ~3.5s of work.
  maxPerTick?: number;
}

export async function processBroadcasts(opts: ProcessOptions = {}): Promise<{
  processed: number;
}> {
  const maxPerTick = opts.maxPerTick ?? 100;

  // Step 1: pick up scheduled broadcasts that are due.
  const due = await db.tgBroadcast.findMany({
    where: {
      status: "scheduled",
      scheduledAt: { lte: new Date() },
    },
    take: 10,
  });
  for (const b of due) {
    await startSending(b);
  }

  // Also pick up draft broadcasts the admin asked to start now (we mark
  // them by setting scheduledAt=now in the API; covered above).

  // Step 2: for each in-flight broadcast, send a chunk.
  const inflight = await db.tgBroadcast.findMany({
    where: { status: "sending" },
    take: 5,
  });

  let processed = 0;

  for (const broadcast of inflight) {
    if (processed >= maxPerTick) break;

    const payloadParsed = messagePayloadSchema.safeParse(broadcast.message);
    if (!payloadParsed.success) {
      await db.tgBroadcast.update({
        where: { id: broadcast.id },
        data: {
          status: "failed",
          finishedAt: new Date(),
        },
      });
      continue;
    }
    const payload: FlowMessagePayload = payloadParsed.data;

    const bot = await db.tgBot.findUnique({ where: { id: broadcast.botId } });
    if (!bot || !bot.isActive) {
      await db.tgBroadcast.update({
        where: { id: broadcast.id },
        data: { status: "failed", finishedAt: new Date() },
      });
      continue;
    }

    const remaining = maxPerTick - processed;
    const recipients = await db.tgBroadcastRecipient.findMany({
      where: {
        broadcastId: broadcast.id,
        status: "pending",
        OR: [
          { nextAttemptAt: null },
          { nextAttemptAt: { lte: new Date() } },
        ],
      },
      take: remaining,
      orderBy: { id: "asc" },
      include: { subscriber: true },
    });

    if (recipients.length === 0) {
      // Maybe done — check if any pending left at all.
      const stillPending = await db.tgBroadcastRecipient.count({
        where: {
          broadcastId: broadcast.id,
          status: { in: ["pending"] },
        },
      });
      if (stillPending === 0) {
        await db.tgBroadcast.update({
          where: { id: broadcast.id },
          data: { status: "completed", finishedAt: new Date() },
        });
        trackEvent({
          type: "broadcast.finished",
          botId: broadcast.botId,
          properties: { broadcastId: broadcast.id },
        }).catch(() => {});
      }
      continue;
    }

    for (const rec of recipients) {
      if (processed >= maxPerTick) break;
      processed++;
      await sendOne(bot, broadcast, rec, payload);
    }
  }

  return { processed };
}

async function sendOne(
  bot: TgBot,
  broadcast: TgBroadcast,
  rec: { id: string; subscriber: TgSubscriber; attempts: number },
  payload: FlowMessagePayload
): Promise<void> {
  if (rec.subscriber.isBlocked) {
    await db.tgBroadcastRecipient.update({
      where: { id: rec.id },
      data: { status: "skipped" },
    });
    await db.tgBroadcast.update({
      where: { id: broadcast.id },
      data: { blockedCount: { increment: 1 } },
    });
    return;
  }

  const res = await sendBotMessage({
    botId: bot.id,
    encryptedToken: bot.tokenEncrypted,
    subscriberId: rec.subscriber.id,
    chatId: rec.subscriber.chatId,
    payload,
    renderCtx: {
      subscriber: {
        chatId: rec.subscriber.chatId,
        firstName: rec.subscriber.firstName,
        lastName: rec.subscriber.lastName,
        username: rec.subscriber.username,
        variables: (rec.subscriber.variables ?? {}) as Record<string, unknown>,
      },
      bot: { username: bot.username, title: bot.title },
      runContext: {},
    },
    sourceType: "broadcast",
    sourceId: broadcast.id,
  });

  if (res.ok) {
    await db.tgBroadcastRecipient.update({
      where: { id: rec.id },
      data: { status: "sent", sentAt: new Date(), tgMessageId: res.tgMessageId },
    });
    await db.tgBroadcast.update({
      where: { id: broadcast.id },
      data: { sentCount: { increment: 1 } },
    });
    trackEvent({
      type: "broadcast.delivered",
      botId: bot.id,
      subscriberId: rec.subscriber.id,
      properties: { broadcastId: broadcast.id },
    }).catch(() => {});
    return;
  }

  if (res.blocked) {
    await db.tgBroadcastRecipient.update({
      where: { id: rec.id },
      data: {
        status: "blocked",
        errorCode: res.errorCode,
        errorMessage: res.errorMessage,
      },
    });
    await db.tgBroadcast.update({
      where: { id: broadcast.id },
      data: { blockedCount: { increment: 1 } },
    });
    return;
  }

  // Retryable failure: bump attempts, back off, leave pending.
  const attempts = rec.attempts + 1;
  if (attempts >= 3) {
    await db.tgBroadcastRecipient.update({
      where: { id: rec.id },
      data: {
        status: "failed",
        errorCode: res.errorCode,
        errorMessage: res.errorMessage,
        attempts,
      },
    });
    await db.tgBroadcast.update({
      where: { id: broadcast.id },
      data: { failedCount: { increment: 1 } },
    });
    trackEvent({
      type: "broadcast.failed",
      botId: bot.id,
      subscriberId: rec.subscriber.id,
      properties: { broadcastId: broadcast.id, errorCode: res.errorCode },
    }).catch(() => {});
  } else {
    // Exponential backoff: 30s, 2min, 10min.
    const delaysMs = [30_000, 120_000, 600_000];
    const next = new Date(Date.now() + (delaysMs[attempts - 1] ?? 600_000));
    await db.tgBroadcastRecipient.update({
      where: { id: rec.id },
      data: {
        attempts,
        nextAttemptAt: next,
        errorCode: res.errorCode,
        errorMessage: res.errorMessage,
      },
    });
  }
}
