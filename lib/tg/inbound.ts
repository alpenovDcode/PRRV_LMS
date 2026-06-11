// Handles a single Telegram Update for a given bot.
// Called from the webhook route AFTER the X-Telegram-Bot-Api-Secret-Token
// check has passed. Idempotent on Telegram's update_id (best-effort,
// using a Redis SETNX with a 1h TTL).

import { db } from "../db";
import { getRedisClient } from "../redis";
import { trackEvent } from "./events";
import {
  triggersSchema,
  triggerAdvanced,
  type FlowTrigger,
} from "./flow-schema";
import {
  startFlowRun,
  deliverReplyToWaitingRun,
  deliverButtonClickToWaitingRun,
} from "./flow-engine";
import { tgAnswerCallbackQuery } from "./api";
import { captureAdminMedia } from "./media-library";
import type { TgBot, TgSubscriber, Prisma } from "@prisma/client";

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
// Telegram update objects (Bot API 7.x). We only declare fields the
// inbound pipeline + media-library auto-capture touch.
interface PhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}
interface FileBase {
  file_id: string;
  file_unique_id: string;
  file_size?: number;
}
interface VideoLike extends FileBase {
  width?: number;
  height?: number;
  duration?: number;
  mime_type?: string;
  file_name?: string;
  thumbnail?: PhotoSize;
}
interface VoiceLike extends FileBase {
  duration?: number;
  mime_type?: string;
}
interface DocumentLike extends FileBase {
  mime_type?: string;
  file_name?: string;
  thumbnail?: PhotoSize;
}
interface AudioLike extends FileBase {
  duration?: number;
  mime_type?: string;
  file_name?: string;
  title?: string;
  performer?: string;
}
interface VideoNoteLike extends FileBase {
  duration?: number;
  thumbnail?: PhotoSize;
}

interface TgContact {
  phone_number: string;
  first_name?: string;
  last_name?: string;
  user_id?: number;
}
interface TgLocation {
  latitude: number;
  longitude: number;
  // Live-location fields we ignore for now.
  horizontal_accuracy?: number;
}

interface TgMessage {
  message_id: number;
  from?: TgUser;
  chat: TgChat;
  date: number;
  text?: string;
  caption?: string;
  photo?: PhotoSize[];
  voice?: VoiceLike;
  video?: VideoLike;
  video_note?: VideoNoteLike;
  document?: DocumentLike;
  audio?: AudioLike;
  animation?: VideoLike;
  contact?: TgContact;
  location?: TgLocation;
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
// chat_member: апдейт о смене статуса ЛЮБОГО участника чата (нужен,
// чтобы считать вступления в каналы). Бот должен быть админом канала
// и подписан на `chat_member` в allowed_updates.
interface TgChatMemberUpdate {
  chat: TgChat;
  from: TgUser;
  old_chat_member: { user: TgUser; status: string };
  new_chat_member: { user: TgUser; status: string };
  invite_link?: {
    invite_link: string;
    name?: string;
    creator?: TgUser;
  };
  date: number;
}
interface TgChatJoinRequest {
  chat: TgChat;
  from: TgUser;
  date: number;
  invite_link?: { invite_link: string; name?: string };
}
interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  edited_message?: TgMessage;
  callback_query?: TgCallbackQuery;
  my_chat_member?: TgMyChatMember;
  chat_member?: TgChatMemberUpdate;
  chat_join_request?: TgChatJoinRequest;
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
  // Бэкафилл: если этот tg_user_id уже был замечен в канале (вступил
  // раньше, чем нажал /start) — линкуем существующие memberships.
  db.tgChannelMembership
    .updateMany({
      where: { botId: bot.id, tgUserId, subscriberId: null },
      data: { subscriberId: created.id },
    })
    .catch(() => undefined);
  trackEvent({
    type: "subscriber.created",
    botId: bot.id,
    subscriberId: created.id,
    properties: { source: "inbound" },
  }).catch(() => {});
  // Авто-экспорт нового лида в Google Sheets (если настроен). Best-effort,
  // не блокирует обработку апдейта. Динамический импорт — чтобы не тянуть
  // зависимость в каждый inbound, если экспорт не используется.
  import("./google-sheets")
    .then((m) => m.exportSubscriberToSheet(bot.id, created.id, "created"))
    .catch(() => {});
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

interface TriggerCtx {
  command?: string;
  commandPayload?: string;
  messageText?: string;
  isNewSubscriber: boolean;
  // True when the inbound update is a callback_query (button click).
  isCallback: boolean;
  // Already-fired-once trigger IDs for this subscriber. Each is
  // `flowId:triggerIndex` so the same trigger logic across multiple
  // flows is tracked independently.
  firedOnce: Set<string>;
}

interface MatchedTrigger {
  flowId: string;
  triggerIndex: number;
  // Effective priority used for ordering — defaults to 10 when unset.
  priority: number;
  // True if the trigger has onlyOnce=true, so the caller knows to
  // append the firedOnce key to TgSubscriber.firedOnceTriggers.
  onlyOnce: boolean;
  triggerInfo: Record<string, unknown>;
}

async function findTriggeredFlows(
  bot: TgBot,
  ctx: TriggerCtx,
): Promise<MatchedTrigger[]> {
  const flows = await db.tgFlow.findMany({
    where: { botId: bot.id, isActive: true },
  });
  const matched: MatchedTrigger[] = [];
  for (const flow of flows) {
    const parsedTriggers = triggersSchema.safeParse(flow.triggers);
    if (!parsedTriggers.success) continue;
    parsedTriggers.data.forEach((trigger, index) => {
      const adv = triggerAdvanced(trigger);
      // onlyOnCallback gate: skip non-callback inputs.
      if (adv.onlyOnCallback && !ctx.isCallback) return;
      // onlyOnce gate: skip if already fired for this subscriber.
      const onceKey = `${flow.id}:${index}`;
      if (adv.onlyOnce && ctx.firedOnce.has(onceKey)) return;
      // Exclusion list: bail if the inbound text matches an exclusion.
      const text = ctx.messageText ?? "";
      if (text && adv.exclusions.some((ex) => text.toLowerCase().includes(ex.toLowerCase()))) {
        return;
      }
      const hit = triggerMatches(trigger, ctx);
      if (!hit) return;
      matched.push({
        flowId: flow.id,
        triggerIndex: index,
        priority: adv.priority,
        onlyOnce: adv.onlyOnce,
        triggerInfo: { triggerType: trigger.type, ...hit },
      });
    });
  }
  // Sort by priority desc — ties keep insertion order so multi-match
  // is deterministic across deploys.
  matched.sort((a, b) => b.priority - a.priority);
  return matched;
}

function keywordMatches(
  trigger: Extract<FlowTrigger, { type: "keyword" }>,
  text: string,
): { keyword: string } | null {
  const mode = trigger.matchMode ?? "keyword";
  const lower = text.toLowerCase().trim();
  for (const kw of trigger.keywords) {
    const k = kw.toLowerCase().trim();
    if (mode === "exact") {
      if (lower === k) return { keyword: kw };
    } else if (mode === "fuzzy") {
      // Levenshtein-normalized distance <30%.
      if (lower === k) return { keyword: kw };
      if (k.length < 4) continue;
      const a = lower, b = k;
      const dp: number[][] = [];
      for (let i = 0; i <= a.length; i++) dp.push([i]);
      for (let j = 1; j <= b.length; j++) dp[0][j] = j;
      for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
          const cost = a[i - 1] === b[j - 1] ? 0 : 1;
          dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
        }
      }
      const dist = dp[a.length][b.length];
      if (dist / Math.max(a.length, b.length) < 0.3) return { keyword: kw };
    } else if (mode === "regex") {
      try {
        const re = new RegExp(kw, "i");
        if (re.test(text)) return { keyword: kw };
      } catch {
        // Bad regex - skip silently.
      }
    } else {
      // default: substring (case-insensitive)
      if (lower.includes(k)) return { keyword: kw };
    }
  }
  return null;
}

function triggerMatches(
  trigger: FlowTrigger,
  ctx: TriggerCtx,
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
    return keywordMatches(trigger, ctx.messageText);
  }
  if (trigger.type === "regex") {
    if (!ctx.messageText) return null;
    try {
      const flags = trigger.flags ?? "i";
      const re = new RegExp(trigger.pattern, flags);
      const m = re.exec(ctx.messageText);
      return m ? { match: m[0] } : null;
    } catch {
      return null;
    }
  }
  if (trigger.type === "subscribed") {
    return ctx.isNewSubscriber ? { subscribed: true } : null;
  }
  // tag_added / tag_removed: wired in Iter 2 with the lists feature.
  return null;
}

/**
 * Резолвит one-shot токен умной ссылки (/g/<bot>/<slug>?utm_*).
 * Token имеет вид `p_<22 hex>`. В Redis под ключом `tg:promo:<token>` лежит
 * JSON `{slug, utm}`. После чтения ключ удаляется (одноразовый — повторное
 * нажатие на ту же сгенерированную t.me-ссылку не создаст второго касания).
 *
 * Если payload не похож на токен или ключа нет в Redis — возвращаем пустой
 * объект, вызывающий код пойдёт по обычной ветке TgTrackingLink по slug.
 */
async function resolvePromoToken(
  payload: string
): Promise<{ slug?: string; overrideUtm?: Record<string, string> }> {
  if (!/^p_[a-f0-9]{16,48}$/i.test(payload)) return {};
  try {
    const redis = await getRedisClient();
    const key = `tg:promo:${payload}`;
    const raw = await redis.get(key);
    if (!raw) return {};
    // One-shot: чистим ключ. Игнорируем гонку — повторный get просто отдаст null.
    redis.del(key).catch(() => undefined);
    const parsed = JSON.parse(raw) as {
      slug?: unknown;
      utm?: unknown;
    };
    const slug = typeof parsed.slug === "string" ? parsed.slug : undefined;
    const overrideUtm =
      parsed.utm && typeof parsed.utm === "object"
        ? (parsed.utm as Record<string, string>)
        : undefined;
    return { slug, overrideUtm };
  } catch (e) {
    console.warn("[promo-token] resolve failed:", e);
    return {};
  }
}

async function applyTrackingLink(args: {
  bot: TgBot;
  subscriber: TgSubscriber;
  slug: string;
  isNewSubscriber: boolean;
  /**
   * UTM, переданные через «умную» редирект-ссылку /g/<bot>/<slug>?utm_…
   * Когда заданы — побеждают базовые UTM из TgTrackingLink (это позволяет
   * на одном слаге обслуживать N кампаний с разными метками).
   */
  overrideUtm?: Record<string, string>;
}): Promise<{ flowId?: string }> {
  const link = await db.tgTrackingLink.findUnique({
    where: { botId_slug: { botId: args.bot.id, slug: args.slug } },
  });
  if (!link) return {};
  // Update touch attribution.
  const now = new Date();

  // UTM из ссылки → client.* переменные подписчика (last-touch). Без этого
  // client.utm_source/medium/... всегда пустые и не уезжают в Bitrix/CRM:
  // ссылка несёт UTM, но раньше они оставались только на самой ссылке.
  // overrideUtm от /g/-редиректора побеждает базовые UTM ссылки.
  const linkUtm = {
    ...((link.utm as Record<string, unknown> | null) ?? {}),
    ...(args.overrideUtm ?? {}),
  };
  const utmVars: Record<string, string> = {};
  for (const k of [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "utm_term",
  ]) {
    const val = linkUtm[k];
    if (val != null && String(val).trim() !== "") utmVars[k] = String(val);
  }

  await db.tgSubscriber.update({
    where: { id: args.subscriber.id },
    data: {
      lastTouchSlug: args.slug,
      lastTouchAt: now,
      firstTouchSlug: args.subscriber.firstTouchSlug ?? args.slug,
      firstTouchAt: args.subscriber.firstTouchAt ?? now,
      tags: Array.from(new Set([...args.subscriber.tags, ...link.applyTags])),
      variables: {
        ...((args.subscriber.variables as Record<string, unknown>) ?? {}),
        ...utmVars,
      } as Prisma.InputJsonValue,
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

/** Telegram-статус считается «состоит в канале», если он не left/kicked. */
function isMemberStatus(s: string): boolean {
  return s !== "left" && s !== "kicked";
}

/**
 * Обрабатывает update.chat_member для подключённых каналов. Идемпотентно:
 * unique (channel_id, tg_user_id), повтор того же события не плодит дубли.
 */
async function handleChatMemberUpdate(
  bot: TgBot,
  m: NonNullable<TgUpdate["chat_member"]>
): Promise<void> {
  const chatId = String(m.chat.id);
  const channel = await db.tgChannel.findUnique({
    where: { botId_chatId: { botId: bot.id, chatId } },
  });
  if (!channel || !channel.isActive) return;

  const tgUserId = String(m.new_chat_member.user.id);
  const wasIn = isMemberStatus(m.old_chat_member.status);
  const isIn = isMemberStatus(m.new_chat_member.status);
  const now = new Date(m.date ? m.date * 1000 : Date.now());

  // Резолвим подписчика по botId+tgUserId. SetNull-relation, не fatal,
  // если не найден — мог вступить в канал, ни разу не нажав /start.
  const sub = await db.tgSubscriber.findFirst({
    where: { botId: bot.id, tgUserId },
    select: { id: true },
  });

  let inviteLinkName: string | null = null;
  let inviteLinkUrl: string | null = null;
  if (m.invite_link) {
    inviteLinkName = m.invite_link.name ?? null;
    inviteLinkUrl = m.invite_link.invite_link ?? null;
  }

  // Идемпотентный upsert по (channel_id, tg_user_id).
  const prev = await db.tgChannelMembership.findUnique({
    where: { channelId_tgUserId: { channelId: channel.id, tgUserId } },
  });

  await db.tgChannelMembership.upsert({
    where: { channelId_tgUserId: { channelId: channel.id, tgUserId } },
    create: {
      botId: bot.id,
      channelId: channel.id,
      tgUserId,
      subscriberId: sub?.id,
      status: m.new_chat_member.status,
      inviteLinkName,
      inviteLinkUrl,
      joinedAt: isIn ? now : null,
      leftAt: isIn ? null : now,
    },
    update: {
      subscriberId: sub?.id ?? undefined,
      status: m.new_chat_member.status,
      // Имя/URL invite-link фиксируем только при join'е (вход через ссылку);
      // на leave Telegram их не присылает.
      ...(isIn && inviteLinkName
        ? { inviteLinkName, inviteLinkUrl }
        : {}),
      ...(isIn && !wasIn ? { joinedAt: now, leftAt: null } : {}),
      ...(!isIn && wasIn ? { leftAt: now } : {}),
    },
  });

  // Атрибуция по invite-link имени → счётчик joinCount.
  if (isIn && !wasIn && inviteLinkName) {
    await db.tgChannelInviteLink.updateMany({
      where: { channelId: channel.id, name: inviteLinkName },
      data: { joinCount: { increment: 1 } },
    }).catch(() => undefined);
  }

  // KPI-события. Новый join = (нет prev и isIn) или (prev был absent → стал present).
  const isJoin = isIn && (!prev || !wasIn);
  const isLeave = !!prev && wasIn && !isIn;
  if (isJoin) {
    trackEvent({
      type: "channel.joined",
      botId: bot.id,
      subscriberId: sub?.id,
      properties: {
        channelId: channel.id,
        channelChatId: channel.chatId,
        tgUserId,
        inviteLinkName,
        firstSeen: !prev,
      },
    }).catch(() => {});
  } else if (isLeave) {
    trackEvent({
      type: "channel.left",
      botId: bot.id,
      subscriberId: sub?.id,
      properties: {
        channelId: channel.id,
        channelChatId: channel.chatId,
        tgUserId,
        // Был ли это «выгнан»/«заблокирован» админом vs ушёл сам.
        kicked: m.new_chat_member.status === "kicked",
      },
    }).catch(() => {});
  }
}

export async function handleUpdate(bot: TgBot, update: TgUpdate): Promise<void> {
  if (await alreadyProcessed(bot.id, update.update_id)) return;

  // --- chat_member: вступления/выходы в подключённых каналах -------------
  if (update.chat_member) {
    await handleChatMemberUpdate(bot, update.chat_member);
    return;
  }

  // --- chat_join_request: пока только лог-событие; одобрение приходит ----
  // отдельным chat_member-апдейтом (если кто-то одобрил).
  if (update.chat_join_request) {
    const r = update.chat_join_request;
    const channel = await db.tgChannel.findUnique({
      where: { botId_chatId: { botId: bot.id, chatId: String(r.chat.id) } },
    });
    if (channel?.isActive) {
      trackEvent({
        type: "channel.join_requested",
        botId: bot.id,
        properties: {
          channelId: channel.id,
          tgUserId: String(r.from.id),
          inviteLinkName: r.invite_link?.name,
        },
      }).catch(() => {});
    }
    return;
  }

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
        tgMessageId: cq.message ? String(cq.message.message_id) : undefined,
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

  // Auto-capture media from whitelisted admins into the library and
  // SHORT-CIRCUIT the rest of the inbound pipeline — we don't want
  // admin's test sends to fire flows or get matched against triggers.
  if (
    bot.adminChatIds.length > 0 &&
    bot.adminChatIds.includes(String(msg.chat.id))
  ) {
    const cap = await captureAdminMedia({
      botId: bot.id,
      encryptedToken: bot.tokenEncrypted,
      adminChatId: String(msg.chat.id),
      message: msg,
      ackInChat: true,
    });
    if (cap.captured) return;
    // Non-media admin messages fall through to normal handling so
    // admins can still test /start flows from their own chat.
  }

  // Auto-capture contact / location into client.* variables and let
  // any wait_reply node treat the phone/coords as the reply text.
  // Conversion to subscriber-friendly text happens here so the rest
  // of the pipeline doesn't need to know whether the input was raw.
  let extractedText: string | null = null;
  if (msg.contact?.phone_number) {
    extractedText = msg.contact.phone_number;
    await db.tgSubscriber.update({
      where: { id: subscriber.id },
      data: {
        variables: {
          ...((subscriber.variables as Record<string, unknown>) ?? {}),
          phone: msg.contact.phone_number,
          phone_first_name: msg.contact.first_name,
          phone_last_name: msg.contact.last_name,
        },
      },
    });
    trackEvent({
      type: "subscriber.contact_received",
      botId: bot.id,
      subscriberId: subscriber.id,
      properties: { phone: msg.contact.phone_number },
    }).catch(() => {});
  } else if (msg.location) {
    extractedText = `${msg.location.latitude},${msg.location.longitude}`;
    await db.tgSubscriber.update({
      where: { id: subscriber.id },
      data: {
        variables: {
          ...((subscriber.variables as Record<string, unknown>) ?? {}),
          location_lat: msg.location.latitude,
          location_lon: msg.location.longitude,
        },
      },
    });
    trackEvent({
      type: "subscriber.location_received",
      botId: bot.id,
      subscriberId: subscriber.id,
      properties: {
        latitude: msg.location.latitude,
        longitude: msg.location.longitude,
      },
    }).catch(() => {});
  }

  const text = msg.text ?? msg.caption ?? extractedText ?? "";
  const startCmd = parseStartCommand(text);
  const cmd = startCmd.isStart ? { command: "start", rest: startCmd.payload ?? "" } : parseCommand(text);
  const commandPayload = startCmd.isStart ? startCmd.payload : cmd?.rest || undefined;

  // 0) Operator live-chat takeover — если оператор «взял» этот диалог,
  // мы НЕ обрабатываем триггеры и не доставляем reply в wait_reply, чтобы
  // бот не перебивал человека. Слэш-команды (/start, /help) — исключение:
  // они работают как «выход» из режима оператора.
  // Авто-release через 24ч на случай, если оператор забыл вернуть бота.
  const OPERATOR_TAKEOVER_TTL_MS = 24 * 60 * 60 * 1000;
  const takeoverAt = subscriber.operatorTakeoverAt;
  const operatorActive =
    !!takeoverAt &&
    Date.now() - takeoverAt.getTime() < OPERATOR_TAKEOVER_TTL_MS;
  const isCommand = cmd !== null;
  if (operatorActive && !isCommand) {
    // Сообщение просто остаётся в логе (storeInboundMessage уже отработал
    // в вызывающем коде); никаких авто-флоу не запускаем.
    return;
  }

  // 1) /start <payload> — apply tracking link first so trigger matchers see fresh tags.
  let linkFlowId: string | undefined;
  if (startCmd.isStart && startCmd.payload) {
    // Если payload — token «умной» ссылки (/g/<bot>/<slug>?utm_*), резолвим
    // {slug, utm} из Redis и применяем как override-UTM. Иначе — обычный slug.
    const { slug, overrideUtm } = await resolvePromoToken(startCmd.payload);
    const effectiveSlug = slug ?? startCmd.payload;
    const r = await applyTrackingLink({
      bot,
      subscriber,
      slug: effectiveSlug,
      isNewSubscriber: created,
      overrideUtm,
    });
    linkFlowId = r.flowId;
  }

  // 2) Deliver reply to a waiting run, if any.
  //
  // EXCEPT for slash-commands — they are "global navigation" (/start,
  // /help, /cancel) and should always reach the trigger matcher,
  // regardless of whether the user is parked in a wait_reply node.
  // Without this exception, typing /start while parked in an email-
  // wait_reply would have the validator complain "❌ Не email" and the
  // user would be stuck (no way to restart short of timeout).
  if (!isCommand) {
    const delivered = await deliverReplyToWaitingRun({
      subscriberId: subscriber.id,
      botId: bot.id,
      text,
    });
    if (delivered) return;
  }

  // 3) Match triggers and start flow runs.
  const fresh = await db.tgSubscriber.findUnique({ where: { id: subscriber.id } });
  if (!fresh) return;
  const firedOnce = new Set<string>(fresh.firedOnceTriggers ?? []);
  const triggered = await findTriggeredFlows(bot, {
    command: cmd?.command,
    commandPayload,
    messageText: text,
    isNewSubscriber: created,
    isCallback: false,
    firedOnce,
  });

  // 4) If a tracking link nominated a specific flow, prepend it (avoid duplicates).
  type ToStart = {
    flowId: string;
    triggerInfo: Record<string, unknown>;
    onceKey?: string;
  };
  const flowsToStart: ToStart[] = [
    ...(linkFlowId && !triggered.some((t) => t.flowId === linkFlowId)
      ? [{
          flowId: linkFlowId,
          triggerInfo: { triggerType: "tracking_link", slug: startCmd.payload } as Record<string, unknown>,
        }]
      : []),
    ...triggered.map((t) => ({
      flowId: t.flowId,
      triggerInfo: t.triggerInfo,
      onceKey: t.onlyOnce ? `${t.flowId}:${t.triggerIndex}` : undefined,
    })),
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
  const newOnceKeys: string[] = [];
  for (const f of flowsToStart.slice(0, 3)) {
    if (!fresh || fresh.isBlocked) break;
    await startFlowRun({
      flowId: f.flowId,
      subscriberId: subscriber.id,
      triggerInfo: f.triggerInfo,
    });
    if (f.onceKey) newOnceKeys.push(f.onceKey);
  }
  if (newOnceKeys.length > 0) {
    await db.tgSubscriber.update({
      where: { id: subscriber.id },
      data: {
        firedOnceTriggers: { push: newOnceKeys },
      },
    });
  }
}
