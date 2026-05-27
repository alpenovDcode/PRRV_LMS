/**
 * lib/messaging/bitrix-sync.ts
 *
 * Bitrix24-синхронизация для messaging-подписчиков (IG / MAX).
 * Структурно повторяет lib/tg/bitrix-sync.ts, но работает с
 * MessagingBitrixConfig и MessagingSubscriber.
 *
 * Поведение:
 *   • Если config disabled — возвращает {skipped: true} без вызовов.
 *   • Находит/создаёт контакт в Bitrix24 (по PHONE → EMAIL).
 *   • Находит/создаёт сделку в воронке.
 *   • Best-effort timeline-комментарий.
 *
 * Вызывается:
 *   • Авто-триггер по тегу (tagTriggers) — см. maybeSyncOnTagAdded
 *   • Вручную через http_request-узел воронки → /api/internal/messaging-bitrix-sync
 */

import { db } from "@/lib/db";

export interface FieldMapping {
  /** LMS variable path: client.phone, client.utm_source, custom.*, deal.* */
  lmsVar: string;
  /** Bitrix24 field ID: PHONE, EMAIL, UF_CRM_..., и т.д. */
  bitrixField: string;
}

export interface TagTrigger {
  tag: string;
  stageId: string;
}

export interface MessagingBitrixSyncOptions {
  stageId?: string;
  forceCreate?: boolean;
  extraDealFields?: Record<string, string>;
  /** Run context — для разрешения переменных deal.* */
  runContext?: Record<string, unknown>;
}

export interface BitrixSyncResult {
  ok: boolean;
  dealId?: string;
  contactId?: string;
  error?: string;
  skipped?: boolean;
}

// ────────────────────────────────────────────────────────────────────────────

export async function bitrixCall(
  webhookUrl: string,
  method: string,
  params: Record<string, unknown> = {}
): Promise<any> {
  const base = webhookUrl.endsWith("/") ? webhookUrl : webhookUrl + "/";
  const res = await fetch(`${base}${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`Bitrix24 ${method} HTTP ${res.status}`);
  }
  const data = await res.json();
  if (data.error) {
    throw new Error(`Bitrix24 ${method}: ${data.error_description ?? data.error}`);
  }
  return data.result;
}

// ────────────────────────────────────────────────────────────────────────────

interface SubscriberSnapshot {
  externalUserId: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  variables: Record<string, unknown>;
  channel: string;
}

function resolveLmsVar(
  lmsVar: string,
  sub: SubscriberSnapshot,
  runContext: Record<string, unknown>
): string {
  const v = sub.variables;

  const builtins: Record<string, () => string> = {
    "client.phone":        () => String(v.phone ?? ""),
    "client.email":        () => String(v.email ?? ""),
    "client.first_name":   () => sub.firstName ?? "",
    "client.last_name":    () => sub.lastName ?? "",
    "client.full_name":    () => [sub.firstName, sub.lastName].filter(Boolean).join(" "),
    "client.username":     () => sub.username ?? "",
    "client.external_id":  () => sub.externalUserId,
    "client.channel":      () => sub.channel,
    "client.utm_source":   () => String(v.utm_source ?? ""),
    "client.utm_medium":   () => String(v.utm_medium ?? ""),
    "client.utm_campaign": () => String(v.utm_campaign ?? ""),
    "client.utm_content":  () => String(v.utm_content ?? ""),
    "client.utm_term":     () => String(v.utm_term ?? ""),
  };

  if (builtins[lmsVar]) return builtins[lmsVar]();
  if (lmsVar.startsWith("client.")) return String(v[lmsVar.slice(7)] ?? "");
  if (lmsVar.startsWith("deal."))  return String(runContext[lmsVar.slice(5)] ?? "");
  return "";
}

// ────────────────────────────────────────────────────────────────────────────

export async function syncMessagingSubscriberToBitrix(
  botId: string,
  subscriberId: string,
  opts: MessagingBitrixSyncOptions = {}
): Promise<BitrixSyncResult> {
  const config = await db.messagingBitrixConfig.findUnique({ where: { botId } });
  if (!config || !config.enabled) return { ok: true, skipped: true };

  const webhookUrl =
    (config.webhookUrl?.trim()) || process.env.BITRIX24_WEBHOOK_URL || "";
  if (!webhookUrl) {
    return { ok: false, error: "Bitrix24 webhook URL не настроен" };
  }

  const sub = await db.messagingSubscriber.findUnique({
    where: { id: subscriberId },
    include: { bot: { select: { channel: true } } },
  });
  if (!sub) return { ok: false, error: `Подписчик ${subscriberId} не найден` };

  const snapshot: SubscriberSnapshot = {
    externalUserId: sub.externalUserId,
    firstName: sub.firstName,
    lastName: sub.lastName,
    username: sub.username,
    variables: (sub.variables as Record<string, unknown>) ?? {},
    channel: sub.bot.channel,
  };
  const runCtx = opts.runContext ?? {};

  const contactMappings = (config.contactMappings as unknown as FieldMapping[]) ?? [];
  const dealMappings = (config.dealMappings as unknown as FieldMapping[]) ?? [];

  const rawContactFields: Record<string, string> = {};
  for (const m of contactMappings) {
    const val = resolveLmsVar(m.lmsVar, snapshot, runCtx);
    if (val) rawContactFields[m.bitrixField] = val;
  }

  const phone = rawContactFields["PHONE"] || resolveLmsVar("client.phone", snapshot, runCtx);
  const email = rawContactFields["EMAIL"] || resolveLmsVar("client.email", snapshot, runCtx);
  const fullName =
    rawContactFields["NAME"] ||
    resolveLmsVar("client.full_name", snapshot, runCtx) ||
    sub.username ||
    `${sub.bot.channel}:${sub.externalUserId}`;

  const rawDealFields: Record<string, string> = {};
  for (const m of dealMappings) {
    const val = resolveLmsVar(m.lmsVar, snapshot, runCtx);
    if (val) rawDealFields[m.bitrixField] = val;
  }
  Object.assign(rawDealFields, opts.extraDealFields ?? {});

  const utmSource = resolveLmsVar("client.utm_source", snapshot, runCtx);
  const utmMedium = resolveLmsVar("client.utm_medium", snapshot, runCtx);
  const utmCampaign = resolveLmsVar("client.utm_campaign", snapshot, runCtx);
  if (utmSource && !rawDealFields["UTM_SOURCE"]) rawDealFields["UTM_SOURCE"] = utmSource;
  if (utmMedium && !rawDealFields["UTM_MEDIUM"]) rawDealFields["UTM_MEDIUM"] = utmMedium;
  if (utmCampaign && !rawDealFields["UTM_CAMPAIGN"]) rawDealFields["UTM_CAMPAIGN"] = utmCampaign;

  try {
    let contactId: string | undefined;

    if (phone) {
      const found = await bitrixCall(webhookUrl, "crm.contact.list", {
        filter: { PHONE: phone },
        select: ["ID"],
      });
      contactId = found?.[0]?.ID;
    }
    if (!contactId && email) {
      const found = await bitrixCall(webhookUrl, "crm.contact.list", {
        filter: { EMAIL: email },
        select: ["ID"],
      });
      contactId = found?.[0]?.ID;
    }

    if (!contactId) {
      const newContact: Record<string, unknown> = {
        NAME: fullName,
        SOURCE_ID: sub.bot.channel.toUpperCase(),
        COMMENTS: `${sub.bot.channel}: ${sub.username ? "@" + sub.username : sub.externalUserId}`,
      };
      if (phone) newContact["PHONE"] = [{ VALUE: phone, VALUE_TYPE: "MOBILE" }];
      if (email) newContact["EMAIL"] = [{ VALUE: email, VALUE_TYPE: "HOME" }];

      for (const [k, v] of Object.entries(rawContactFields)) {
        if (k !== "PHONE" && k !== "EMAIL" && k !== "NAME") newContact[k] = v;
      }

      contactId = String(
        await bitrixCall(webhookUrl, "crm.contact.add", { fields: newContact })
      );
    } else {
      const updateFields: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rawContactFields)) {
        if (k !== "PHONE" && k !== "EMAIL") updateFields[k] = v;
      }
      if (Object.keys(updateFields).length > 0) {
        await bitrixCall(webhookUrl, "crm.contact.update", {
          id: contactId,
          fields: updateFields,
        }).catch(() => {});
      }
    }

    const categoryId =
      String(config.funnelId) === "0" ? 0 : Number(config.funnelId);
    const stageId = opts.stageId || config.defaultStageId || undefined;

    let dealId: string | undefined;
    if (!opts.forceCreate && contactId) {
      const deals = await bitrixCall(webhookUrl, "crm.deal.list", {
        filter: {
          CATEGORY_ID: categoryId,
          CONTACT_ID: contactId,
          CLOSED: "N",
        },
        select: ["ID", "STAGE_ID"],
        order: { ID: "DESC" },
      });
      dealId = deals?.[0]?.ID;
    }

    const link = sub.username
      ? `@${sub.username}`
      : `${sub.bot.channel}:${sub.externalUserId}`;
    const dealBase: Record<string, unknown> = {
      TITLE: `${sub.bot.channel.toUpperCase()}: ${fullName}`,
      CATEGORY_ID: categoryId,
      CONTACT_ID: contactId,
      COMMENTS: `${sub.bot.channel}: ${link}`,
      ...rawDealFields,
    };
    if (stageId) dealBase["STAGE_ID"] = stageId;

    if (dealId) {
      const updateData = { ...dealBase };
      if (!stageId) delete updateData["STAGE_ID"]; // не понижаем стадию
      await bitrixCall(webhookUrl, "crm.deal.update", {
        id: dealId,
        fields: updateData,
      });
    } else {
      dealId = String(
        await bitrixCall(webhookUrl, "crm.deal.add", { fields: dealBase })
      );
    }

    if (dealId) {
      const lines = [
        `Синхронизировано из ${sub.bot.channel.toUpperCase()} LMS`,
        `Подписчик: ${link}`,
      ];
      if (utmSource) lines.push(`UTM: ${utmSource}/${utmCampaign}`);
      await bitrixCall(webhookUrl, "crm.timeline.comment.add", {
        fields: {
          ENTITY_ID: Number(dealId),
          ENTITY_TYPE: "deal",
          COMMENT: lines.join("\n"),
        },
      }).catch(() => {});
    }

    return { ok: true, dealId, contactId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[messaging-bitrix-sync] bot=${botId} sub=${subscriberId}:`, msg);
    return { ok: false, error: msg };
  }
}

// ────────────────────────────────────────────────────────────────────────────

export async function maybeSyncMessagingOnTagAdded(
  botId: string,
  subscriberId: string,
  tag: string,
  runContext?: Record<string, unknown>
): Promise<void> {
  try {
    const config = await db.messagingBitrixConfig.findUnique({
      where: { botId },
      select: { enabled: true, tagTriggers: true },
    });
    if (!config?.enabled) return;

    const triggers = (config.tagTriggers as unknown as TagTrigger[]) ?? [];
    const matched = triggers.find((t) => t.tag === tag);
    if (!matched) return;

    await syncMessagingSubscriberToBitrix(botId, subscriberId, {
      stageId: matched.stageId || undefined,
      runContext,
    });
  } catch (e) {
    // Sync не должен падать flow-engine
    console.error("[messaging-bitrix-sync] maybeSyncOnTagAdded:", e);
  }
}
