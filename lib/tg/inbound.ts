// Handles a single Telegram Update for a given bot.
// Called from the webhook route AFTER the X-Telegram-Bot-Api-Secret-Token
// check has passed. Idempotent on Telegram's update_id (best-effort,
// using a Redis SETNX with a 1h TTL).

import { db } from "../db";
import { getRedisClient } from "../redis";
import { trackEvent } from "./events";
import {
  triggersSchema,
  type FlowTrigger,
} from "./flow-schema";
import {
  startFlowRun,
  deliverReplyToWaitingRun,
  deliverButtonClickToWaitingRun,
} from "./flow-engine";
import { tgAnswerCallbackQuery } from "./api";
import type { TgBot, TgSubscriber } from "@prisma/client";

// Minimal types — we only access fields we need.
interface TgUser {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}
interface TgChat {
  id: number;
  type: string;
}
interface TgMessage {
  message_id: number;
  from?: TgUser;
  chat: TgChat;
  date: number;
  text?: string;
  photo?: Array<{ file_id: string }>;
  voice?: { file_id: string };
  video?: { file_id: string };
  document?: { file_id: string; mime_type?: string };
  caption?: string;
}
interface TgCallbackQuery {
  id: string;
  from: TgUser;
  message?: TgMessage;
  data?: string;
}
interface TgMyChatMember {
  chat: TgChat;
  from: TgUser;
  new_chat_member: { status: string };
}
interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  edited_message?: TgMessage;
  callback_query?: TgCallbackQuery;
  my_chat_member?: TgMyChatMember;
}

async function alreadyProcessed(botId: string, updateId: number): Promise<boolean> {
  try {
    const client = await getRedisClient();
    const key = `tg:upd:${botId}:${updateId}`;
    // SETNX returns true if the key was set, false if it already existed.
    const setRes = await client.set(key, "1", { NX: true, EX: 3600 });
    return setRes === null;
  } catch {
    // If Redis is down, fall through — at-least-once is acceptable here.
    return false;
  }
}

async function upsertSubscriber(args: {
  bot: TgBot;
  chat: TgChat;
  user?: TgUser;
}): Promise<{ subscriber: TgSubscriber; created: boolean }> {
  const { bot, chat, user } = args;
  const chatId = String(chat.id);
  const tgUserId = String(user?.id ?? chat.id);
  const existing = await db.tgSubscriber.findUnique({
    where: { botId_chatId: { botId: bot.id, chatId } },
  });
  if (existing) {
    // Touch last_seen.
    const updated = await db.tgSubscriber.update({
      where: { id: existing.id },
      data: {
        lastSeenAt: new Date(),
        // If we previously marked them blocked, clear it on activity.
        isBlocked: false,
        // Update names if Telegram gave us fresher values.
        firstName: user?.first_name ?? existing.firstName,
        lastName: user?.last_name ?? existing.lastName,
        username: user?.username ?? existing.username,
        languageCode: user?.language_code ?? existing.languageCode,
      },
    });
    if (existing.isBlocked) {
      trackEvent({
        type: "subscriber.unblocked_bot",
        botId: bot.id,
        subscriberId: existing.id,
      }).catch(() => {});
    }
    return { subscriber: updated, created: false };
  }
  const created = await db.tgSubscriber.create({
    data: {
      botId: bot.id,
      chatId,
      tgUserId,
      firstName: user?.first_name,
      lastName: user?.last_name,
      username: user?.username,
      languageCode: user?.language_code,
      lastSeenAt: new Date(),
    },
  });
  await db.tgBot.update({
    where: { id: bot.id },
    data: { subscriberCount: { increment: 1 } },
  });
  trackEvent({
    type: "subscriber.created",
    botId: bot.id,
    subscriberId: created.id,
    properties: { source: "inbound" },
  }).catch(() => {});
  return { subscriber: created, created: true };
}

// Parses /start [payload] — payload up to 64 chars (Telegram deeplink rules).
function parseStartCommand(text: string): { isStart: boolean; payload?: string } {
  const m = /^\/start(?:@\w+)?(?:\s+(.+))?$/i.exec(text.trim());
  if (!m) return { isStart: false };
  return { isStart: true, payload: m[1]?.trim() };
}

function parseCommand(text: string): { command: string; rest: string } | null {
  const m = /^\/([a-zA-Z0-9_]+)(?:@\w+)?(?:\s+(.*))?$/.exec(text.trim());
  if (!m) return null;
  return { command: m[1].toLowerCase(), rest: m[2] ?? "" };
}

async function recordIncomingMessage(args: {
  bot: TgBot;
  subscriber: TgSubscriber;
  msg: TgMessage;
}): Promise<void> {
  const { bot, subscriber, msg } = args;
  let mediaType: string | null = null;
  let mediaFileId: string | null = null;
  if (msg.photo && msg.photo.length > 0) {
    mediaType = "photo";
    mediaFileId = msg.photo[msg.photo.length - 1].file_id;
  } else if (msg.voice) {
    mediaType = "voice";
    mediaFileId = msg.voice.file_id;
  } else if (msg.video) {
    mediaType = "video";
    mediaFileId = msg.video.file_id;
  } else if (msg.document) {
    mediaType = "document";
    mediaFileId = msg.document.file_id;
  }
  await db.tgMessage.create({
    data: {
      botId: bot.id,
      subscriberId: subscriber.id,
      direction: "in",
      tgMessageId: String(msg.message_id),
      text: msg.text ?? msg.caption ?? null,
      mediaType,
      mediaFileId,
      sourceType: "inbound",
    },
  });
  trackEvent({
    type: "message.received",
    botId: bot.id,
    subscriberId: subscriber.id,
    properties: {
      hasText: Boolean(msg.text),
      mediaType,
    },
  }).catch(() => {});
}

async function findTriggeredFlows(
  bot: TgBot,
  ctx: { command?: string; commandPayload?: string; messageText?: string; isNewSubscriber: boolean }
): Promise<Array<{ flowId: string; triggerInfo: Record<string, unknown> }>> {
  const flows = await db.tgFlow.findMany({
    where: { botId: bot.id, isActive: true },
  });
  const matched: Array<{ flowId: string; triggerInfo: Record<string, unknown> }> = [];
  for (const flow of flows) {
    const parsedTriggers = triggersSchema.safeParse(flow.triggers);
    if (!parsedTriggers.success) continue;
    for (const trigger of parsedTriggers.data) {
      const hit = triggerMatches(trigger, ctx);
      if (hit) {
        matched.push({
          flowId: flow.id,
          triggerInfo: { triggerType: trigger.type, ...hit },
        });
        break; // one match per flow is enough
      }
    }
  }
  return matched;
}

function triggerMatches(
  trigger: FlowTrigger,
  ctx: { command?: string; commandPayload?: string; messageText?: string; isNewSubscriber: boolean }
): Record<string, unknown> | null {
  if (trigger.type === "command") {
    if (!ctx.command || ctx.command !== trigger.command.toLowerCase()) return null;
    if (trigger.payloads && trigger.payloads.length > 0) {
      if (!ctx.commandPayload || !trigger.payloads.includes(ctx.commandPayload)) return null;
    }
    return { command: ctx.command, payload: ctx.commandPayload ?? null };
  }
  if (trigger.type === "keyword") {
    if (!ctx.messageText) return null;
    const lower = ctx.messageText.toLowerCase();
    const hit = trigger.keywords.find((k) => lower.includes(k.toLowerCase()));
    return hit ? { keyword: hit } : null;
  }
  if (trigger.type === "regex") {
    if (!ctx.messageText) return null;
    try {
      const re = new RegExp(trigger.pattern, "i");
      const m = re.exec(ctx.messageText);
      return m ? { match: m[0] } : null;
    } catch {
      return null;
    }
  }
  if (trigger.type === "subscribed") {
    return ctx.isNewSubscriber ? { subscribed: true } : null;
  }
  return null;
}

async function applyTrackingLink(args: {
  bot: TgBot;
  subscriber: TgSubscriber;
  slug: string;
  isNewSubscriber: boolean;
}): Promise<{ flowId?: string }> {
  const link = await db.tgTrackingLink.findUnique({
    where: { botId_slug: { botId: args.bot.id, slug: args.slug } },
  });
  if (!link) return {};
  // Update touch attribution.
  const now = new Date();
  await db.tgSubscriber.update({
    where: { id: args.subscriber.id },
    data: {
      lastTouchSlug: args.slug,
      lastTouchAt: now,
      firstTouchSlug: args.subscriber.firstTouchSlug ?? args.slug,
      firstTouchAt: args.subscriber.firstTouchAt ?? now,
      tags: Array.from(new Set([...args.subscriber.tags, ...link.applyTags])),
    },
  });
  await db.tgTrackingLink.update({
    where: { id: link.id },
    data: {
      clickCount: { increment: 1 },
      subscribeCount: args.isNewSubscriber ? { increment: 1 } : undefined,
    },
  });
  trackEvent({
    type: "link.clicked",
    botId: args.bot.id,
    subscriberId: args.subscriber.id,
    properties: { slug: args.slug, utm: link.utm, isNew: args.isNewSubscriber },
  }).catch(() => {});
  return { flowId: link.startFlowId ?? undefined };
}

export async function handleUpdate(bot: TgBot, update: TgUpdate): Promise<void> {
  if (await alreadyProcessed(bot.id, update.update_id)) return;

  // --- my_chat_member: track blocked/unblocked ---
  if (update.my_chat_member) {
    const m = update.my_chat_member;
    const { subscriber } = await upsertSubscriber({
      bot,
      chat: m.chat,
      user: m.from,
    });
    if (m.new_chat_member.status === "kicked") {
      await db.tgSubscriber.update({
        where: { id: subscriber.id },
        data: { isBlocked: true, unsubscribedAt: new Date() },
      });
      trackEvent({
        type: "subscriber.blocked_bot",
        botId: bot.id,
        subscriberId: subscriber.id,
      }).catch(() => {});
    }
    return;
  }

  // --- callback_query: button click ---
  if (update.callback_query) {
    const cq = update.callback_query;
    if (!cq.message) {
      await tgAnswerCallbackQuery(bot.tokenEncrypted, cq.id).catch(() => undefined);
      return;
    }
    const { subscriber } = await upsertSubscriber({
      bot,
      chat: cq.message.chat,
      user: cq.from,
    });
    // Always answer the callback so the client stops the loading spinner.
    tgAnswerCallbackQuery(bot.tokenEncrypted, cq.id).catch(() => undefined);
    if (cq.data) {
      await db.tgMessage.create({
        data: {
          botId: bot.id,
          subscriberId: subscriber.id,
          direction: "in",
          callbackData: cq.data,
          sourceType: "callback",
        },
      });
      trackEvent({
        type: "button.clicked",
        botId: bot.id,
        subscriberId: subscriber.id,
        properties: { callbackData: cq.data },
      }).catch(() => {});
      await deliverButtonClickToWaitingRun({
        subscriberId: subscriber.id,
        botId: bot.id,
        callbackData: cq.data,
      });
    }
    return;
  }

  // --- message / edited_message ---
  const msg = update.message ?? update.edited_message;
  if (!msg || msg.chat.type !== "private") return;
  // Ignore messages from other bots.
  if (msg.from?.is_bot) return;

  const { subscriber, created } = await upsertSubscriber({
    bot,
    chat: msg.chat,
    user: msg.from,
  });
  await recordIncomingMessage({ bot, subscriber, msg });

  const text = msg.text ?? msg.caption ?? "";
  const startCmd = parseStartCommand(text);
  const cmd = startCmd.isStart ? { command: "start", rest: startCmd.payload ?? "" } : parseCommand(text);
  const commandPayload = startCmd.isStart ? startCmd.payload : cmd?.rest || undefined;

  // 1) /start <payload> — apply tracking link first so trigger matchers see fresh tags.
  let linkFlowId: string | undefined;
  if (startCmd.isStart && startCmd.payload) {
    const r = await applyTrackingLink({
      bot,
      subscriber,
      slug: startCmd.payload,
      isNewSubscriber: created,
    });
    linkFlowId = r.flowId;
  }

  // 2) Deliver reply to a waiting run, if any.
  const delivered = await deliverReplyToWaitingRun({
    subscriberId: subscriber.id,
    botId: bot.id,
    text,
  });
  if (delivered) return;

  // 3) Match triggers and start flow runs.
  const fresh = await db.tgSubscriber.findUnique({ where: { id: subscriber.id } });
  const triggered = await findTriggeredFlows(bot, {
    command: cmd?.command,
    commandPayload,
    messageText: text,
    isNewSubscriber: created,
  });

  // 4) If a tracking link nominated a specific flow, prepend it (avoid duplicates).
  const flowsToStart = [
    ...(linkFlowId && !triggered.some((t) => t.flowId === linkFlowId)
      ? [{ flowId: linkFlowId, triggerInfo: { triggerType: "tracking_link", slug: startCmd.payload } }]
      : []),
    ...triggered,
  ];

  // 5) Fallback: if /start with no triggers matched, fire the bot's default start flow.
  if (
    startCmd.isStart &&
    flowsToStart.length === 0 &&
    bot.defaultStartFlowId
  ) {
    flowsToStart.push({
      flowId: bot.defaultStartFlowId,
      triggerInfo: { triggerType: "default_start" },
    });
  }

  // Cap concurrent starts to keep a single message from spawning a swarm.
  for (const f of flowsToStart.slice(0, 3)) {
    if (!fresh || fresh.isBlocked) break;
    await startFlowRun({
      flowId: f.flowId,
      subscriberId: subscriber.id,
      triggerInfo: f.triggerInfo,
    });
  }
}
