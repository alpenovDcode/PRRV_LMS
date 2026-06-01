/**
 * lib/tg/bitrix-sync.ts
 *
 * Core Bitrix24 sync for the Telegram bot platform.
 *
 * Основная логика:
 *  1. Загружаем TgBitrixConfig для бота
 *  2. Резолвим LMS-переменные подписчика по маппингу
 *  3. Находим или создаём контакт в Б24 (поиск по телефону → email)
 *  4. Находим или создаём/обновляем сделку в нужной воронке
 *  5. Возвращаем {ok, dealId, contactId, error}
 *
 * Вызывается:
 *  - Автоматически из inline-actions.ts при добавлении тега (tag_triggers)
 *  - Вручную через http_request ноду → /api/internal/bitrix-sync
 */

import { db } from "../db";
import { trackEvent } from "./events";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface FieldMapping {
  /** LMS variable path: client.phone, client.utm_source, custom.myField, deal.budget */
  lmsVar: string;
  /** Bitrix24 field ID: PHONE, EMAIL, UTM_SOURCE, UF_CRM_123, etc. */
  bitrixField: string;
}

export interface TagTrigger {
  /** Tag name that triggers sync */
  tag: string;
  /** Bitrix24 STAGE_ID to set on deal creation/update */
  stageId: string;
}

export interface BitrixSyncOptions {
  /** Override stage from tagTrigger or caller */
  stageId?: string;
  /** Force deal creation even if one exists */
  forceCreate?: boolean;
  /** Extra deal fields to merge (raw Bitrix field IDs) */
  extraDealFields?: Record<string, string>;
  /** Run context for deal.* variable resolution */
  runContext?: Record<string, unknown>;
}

export interface BitrixSyncResult {
  ok: boolean;
  dealId?: string;
  contactId?: string;
  error?: string;
  /** true if config was disabled / missing */
  skipped?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Low-level Bitrix24 API call
// ─────────────────────────────────────────────────────────────────────────────

export async function bitrixCall(
  webhookUrl: string,
  method: string,
  params: Record<string, unknown> = {}
): Promise<any> {
  // Ensure webhook URL ends with /
  const base = webhookUrl.endsWith("/") ? webhookUrl : webhookUrl + "/";
  const res = await fetch(`${base}${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`Bitrix24 ${method} returned HTTP ${res.status}`);
  }
  const data = await res.json();
  if (data.error) {
    throw new Error(`Bitrix24 error [${method}]: ${data.error_description ?? data.error}`);
  }
  return data.result;
}

// ─────────────────────────────────────────────────────────────────────────────
// LMS variable resolver
// ─────────────────────────────────────────────────────────────────────────────

interface SubscriberSnapshot {
  chatId: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  variables: Record<string, unknown>;
  customFields: Record<string, unknown>;
}

function resolveLmsVar(
  lmsVar: string,
  sub: SubscriberSnapshot,
  runContext: Record<string, unknown>
): string {
  const v = sub.variables;
  const cf = sub.customFields;

  // Именованные алиасы — наиболее частые поля
  const builtins: Record<string, () => string> = {
    "client.phone":        () => String(v.phone ?? ""),
    "client.email":        () => String(v.email ?? ""),
    "client.first_name":   () => sub.firstName ?? "",
    "client.last_name":    () => sub.lastName ?? "",
    "client.full_name":    () => [sub.firstName, sub.lastName].filter(Boolean).join(" "),
    "client.username":     () => sub.username ?? "",
    "client.tg_id":        () => sub.chatId,
    "client.utm_source":   () => String(v.utm_source ?? ""),
    "client.utm_medium":   () => String(v.utm_medium ?? ""),
    "client.utm_campaign": () => String(v.utm_campaign ?? ""),
    "client.utm_content":  () => String(v.utm_content ?? ""),
    "client.utm_term":     () => String(v.utm_term ?? ""),
    "client.location_lat": () => String(v.location_lat ?? ""),
    "client.location_lon": () => String(v.location_lon ?? ""),
  };

  if (builtins[lmsVar]) return builtins[lmsVar]();

  // client.<any> → subscriber.variables
  if (lmsVar.startsWith("client.")) {
    return String(v[lmsVar.slice(7)] ?? "");
  }
  // custom.<key> → subscriber.customFields
  if (lmsVar.startsWith("custom.")) {
    return String(cf[lmsVar.slice(7)] ?? "");
  }
  // deal.<key> → run context
  if (lmsVar.startsWith("deal.")) {
    return String(runContext[lmsVar.slice(5)] ?? "");
  }
  return "";
}

// ─────────────────────────────────────────────────────────────────────────────
// Main sync function
// ─────────────────────────────────────────────────────────────────────────────

export async function syncSubscriberToBitrix(
  botId: string,
  subscriberId: string,
  opts: BitrixSyncOptions = {}
): Promise<BitrixSyncResult> {
  // 1. Load config
  const config = await db.tgBitrixConfig.findUnique({ where: { botId } });
  if (!config || !config.enabled) {
    trackEvent({
      type: "bitrix.sync_skipped",
      botId,
      subscriberId,
      properties: { reason: "disabled" },
    }).catch(() => {});
    return { ok: true, skipped: true };
  }

  const webhookUrl =
    (config.webhookUrl?.trim()) || process.env.BITRIX24_WEBHOOK_URL || "";
  if (!webhookUrl) {
    trackEvent({
      type: "bitrix.sync_skipped",
      botId,
      subscriberId,
      properties: { reason: "no_webhook" },
    }).catch(() => {});
    return { ok: false, error: "Bitrix24 webhook URL не настроен" };
  }

  // 2. Load subscriber
  const sub = await db.tgSubscriber.findUnique({ where: { id: subscriberId } });
  if (!sub) {
    return { ok: false, error: `Подписчик ${subscriberId} не найден` };
  }

  const snapshot: SubscriberSnapshot = {
    chatId: sub.chatId,
    firstName: sub.firstName,
    lastName: sub.lastName,
    username: sub.username,
    variables: (sub.variables as Record<string, unknown>) ?? {},
    customFields: (sub.customFields as Record<string, unknown>) ?? {},
  };
  const runCtx = opts.runContext ?? {};

  // 3. Build contact fields from mapping
  const contactMappings = (config.contactMappings as unknown as FieldMapping[]) ?? [];
  const dealMappings = (config.dealMappings as unknown as FieldMapping[]) ?? [];

  const rawContactFields: Record<string, string> = {};
  for (const m of contactMappings) {
    const val = resolveLmsVar(m.lmsVar, snapshot, runCtx);
    if (val) rawContactFields[m.bitrixField] = val;
  }

  // Always extract phone/email for contact lookup even if not in mapping
  const phone =
    rawContactFields["PHONE"] || resolveLmsVar("client.phone", snapshot, runCtx);
  const email =
    rawContactFields["EMAIL"] || resolveLmsVar("client.email", snapshot, runCtx);
  const fullName =
    rawContactFields["NAME"] ||
    resolveLmsVar("client.full_name", snapshot, runCtx) ||
    sub.username ||
    `tg:${sub.chatId}`;

  // 4. Build deal fields from mapping
  const rawDealFields: Record<string, string> = {};
  for (const m of dealMappings) {
    const val = resolveLmsVar(m.lmsVar, snapshot, runCtx);
    if (val) rawDealFields[m.bitrixField] = val;
  }
  // Merge extra fields from caller
  Object.assign(rawDealFields, opts.extraDealFields ?? {});

  // Auto-fill UTM if available and not already mapped
  const utmSource = resolveLmsVar("client.utm_source", snapshot, runCtx);
  const utmMedium = resolveLmsVar("client.utm_medium", snapshot, runCtx);
  const utmCampaign = resolveLmsVar("client.utm_campaign", snapshot, runCtx);
  if (utmSource && !rawDealFields["UTM_SOURCE"]) rawDealFields["UTM_SOURCE"] = utmSource;
  if (utmMedium && !rawDealFields["UTM_MEDIUM"]) rawDealFields["UTM_MEDIUM"] = utmMedium;
  if (utmCampaign && !rawDealFields["UTM_CAMPAIGN"]) rawDealFields["UTM_CAMPAIGN"] = utmCampaign;

  try {
    // ── 5. Find or create Bitrix24 contact ─────────────────────────────────

    let contactId: string | undefined;

    // Search by phone first (more reliable), then email
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
      // Create new contact
      const newContact: Record<string, unknown> = {
        NAME: fullName,
        SOURCE_ID: "TELEGRAM",
        COMMENTS: `Telegram: ${sub.username ? "@" + sub.username : "id " + sub.chatId}`,
      };
      if (phone) newContact["PHONE"] = [{ VALUE: phone, VALUE_TYPE: "MOBILE" }];
      if (email) newContact["EMAIL"] = [{ VALUE: email, VALUE_TYPE: "HOME" }];

      // Merge any extra mapped contact fields (skip PHONE/EMAIL — already handled)
      for (const [k, v] of Object.entries(rawContactFields)) {
        if (k !== "PHONE" && k !== "EMAIL" && k !== "NAME") newContact[k] = v;
      }

      contactId = String(
        await bitrixCall(webhookUrl, "crm.contact.add", { fields: newContact })
      );
    } else {
      // Update existing contact with latest values
      const updateFields: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rawContactFields)) {
        if (k !== "PHONE" && k !== "EMAIL") updateFields[k] = v;
      }
      if (Object.keys(updateFields).length > 0) {
        await bitrixCall(webhookUrl, "crm.contact.update", {
          id: contactId,
          fields: updateFields,
        }).catch(() => {}); // best-effort update
      }
    }

    // ── 6. Find or create/update Bitrix24 deal ────────────────────────────

    const categoryId =
      String(config.funnelId) === "0" ? 0 : Number(config.funnelId);
    const stageId = opts.stageId || config.defaultStageId || undefined;

    let dealId: string | undefined;
    if (!opts.forceCreate && contactId) {
      const deals = await bitrixCall(webhookUrl, "crm.deal.list", {
        filter: {
          CATEGORY_ID: categoryId,
          CONTACT_ID: contactId,
          CLOSED: "N", // only open deals
        },
        select: ["ID", "STAGE_ID"],
        order: { ID: "DESC" },
      });
      dealId = deals?.[0]?.ID;
    }

    const tgLink = sub.username ? `@${sub.username}` : `tg://user?id=${sub.chatId}`;
    const dealBase: Record<string, unknown> = {
      TITLE: `Telegram: ${fullName}`,
      CATEGORY_ID: categoryId,
      CONTACT_ID: contactId,
      COMMENTS: `Telegram: ${tgLink}`,
      ...rawDealFields,
    };
    if (stageId) dealBase["STAGE_ID"] = stageId;

    if (dealId) {
      // Update existing deal — preserve stage unless caller explicitly sets one
      const updateData = { ...dealBase };
      if (!stageId) delete updateData["STAGE_ID"]; // don't downgrade stage
      await bitrixCall(webhookUrl, "crm.deal.update", {
        id: dealId,
        fields: updateData,
      });
    } else {
      // Create new deal
      dealId = String(
        await bitrixCall(webhookUrl, "crm.deal.add", { fields: dealBase })
      );
    }

    // ── 7. Timeline comment (best-effort) ────────────────────────────────

    if (dealId) {
      const lines = [
        "Синхронизировано из Telegram LMS",
        `Подписчик: ${tgLink}`,
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

    trackEvent({
      type: "bitrix.sync_ok",
      botId,
      subscriberId,
      properties: { dealId, contactId, stageId, categoryId },
    }).catch(() => {});
    return { ok: true, dealId, contactId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[bitrix-sync] botId=${botId} subscriberId=${subscriberId}:`, msg);
    trackEvent({
      type: "bitrix.sync_failed",
      botId,
      subscriberId,
      properties: { error: msg },
    }).catch(() => {});
    return { ok: false, error: msg };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Check tagTriggers for this bot and fire sync if tag matches
// Called from inline-actions.ts after addTag.
// ─────────────────────────────────────────────────────────────────────────────

export async function maybeSyncOnTagAdded(
  botId: string,
  subscriberId: string,
  tag: string,
  runContext?: Record<string, unknown>
): Promise<void> {
  try {
    const config = await db.tgBitrixConfig.findUnique({
      where: { botId },
      select: { enabled: true, tagTriggers: true },
    });
    if (!config?.enabled) return;

    const triggers = (config.tagTriggers as unknown as TagTrigger[]) ?? [];
    const matched = triggers.find((t) => t.tag === tag);
    if (!matched) {
      // Тег добавлен, интеграция включена, но под него нет тег-триггера.
      // Логируем — частая причина «сделка не создалась»: тег в воронке и
      // в настройке Bitrix написаны по-разному.
      trackEvent({
        type: "bitrix.sync_skipped",
        botId,
        subscriberId,
        properties: {
          reason: "no_trigger",
          tag,
          configuredTags: triggers.map((t) => t.tag),
        },
      }).catch(() => {});
      return;
    }

    await syncSubscriberToBitrix(botId, subscriberId, {
      stageId: matched.stageId || undefined,
      runContext,
    });
  } catch (e) {
    // Never throw — Bitrix sync must not crash the flow engine
    console.error("[bitrix-sync] maybeSyncOnTagAdded error:", e);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: test connection + return funnels list
// ─────────────────────────────────────────────────────────────────────────────

export interface BitrixFunnel {
  id: string;
  name: string;
  stages: Array<{ id: string; name: string; sort: number }>;
}

export async function fetchBitrixFunnels(
  webhookUrl: string
): Promise<BitrixFunnel[]> {
  const base = webhookUrl.endsWith("/") ? webhookUrl : webhookUrl + "/";

  const funnelsData = await bitrixCall(base, "crm.dealcategory.list");
  const allFunnels = [
    { ID: "0", NAME: "Общая воронка (Default)" },
    ...(funnelsData ?? []),
  ];

  return Promise.all(
    allFunnels.map(async (f: any) => {
      let stages: any[] = [];
      try {
        if (f.ID === "0") {
          const r = await bitrixCall(
            base,
            "crm.status.list",
            { filter: { ENTITY_ID: "DEAL_STAGE" } }
          );
          stages = r ?? [];
        } else {
          const r = await bitrixCall(
            base,
            "crm.dealcategory.stage.list",
            { id: f.ID }
          );
          stages = r ?? [];
        }
      } catch {}
      stages.sort((a: any, b: any) => Number(a.SORT) - Number(b.SORT));
      return {
        id: String(f.ID),
        name: f.NAME,
        stages: stages.map((s: any) => ({
          id: s.STATUS_ID || s.ID,
          name: s.NAME,
          sort: Number(s.SORT ?? 0),
        })),
      };
    })
  );
}

export async function fetchBitrixDealFields(
  webhookUrl: string
): Promise<Array<{ id: string; label: string; type: string }>> {
  const base = webhookUrl.endsWith("/") ? webhookUrl : webhookUrl + "/";
  const result = await bitrixCall(base, "crm.deal.fields");
  if (!result) return [];
  return Object.entries(result)
    .filter(([, v]: [string, any]) => !v.isReadOnly)
    .map(([key, v]: [string, any]) => ({
      id: key,
      label: v.formLabel || v.title || key,
      type: v.type ?? "string",
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "ru"));
}
