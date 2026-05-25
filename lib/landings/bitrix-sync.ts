/**
 * lib/landings/bitrix-sync.ts
 *
 * Landing form → Bitrix24 sync.
 * Right-hand logic: select the most-advanced open deal as master,
 * merge field values from older duplicates, close the rest.
 *
 * Uses the shared bitrixCall helper from lib/tg/bitrix-sync.
 */

import { bitrixCall } from "@/lib/tg/bitrix-sync";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Optional subscriber context forwarded from the bot flow that sent the
 * landing link.  Populated when the visitor arrived via ?sid=<subscriberId>.
 */
export interface SubscriberContext {
  id: string;
  chatId: string;
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  tags: string[];
  /** subscriber.variables — may contain utm_source / utm_medium / etc. */
  variables: Record<string, unknown>;
  customFields: Record<string, unknown>;
  firstTouchSlug?: string | null;
  firstTouchAt?: Date | null;
  lastTouchSlug?: string | null;
  lastTouchAt?: Date | null;
  botTitle?: string;
  botUsername?: string;
}

export interface LandingBitrixInput {
  webhookUrl: string;
  /** Bitrix24 funnel (category) ID, "0" for default */
  funnelId: string;
  /** Target stage to move deal into on this submission */
  stageId: string;
  /** Raw page settings object (landingPage.settings) */
  pageSettings: any;
  /** Landing page title for deal title / comments */
  landingTitle: string;
  fullName: string;
  email: string;
  phone: string | null;
  /** Raw form data keyed by field label */
  data: Record<string, string>;
  /** Answers keyed by blockId */
  answers: Record<string, any>;
  /** All blocks of the page (for Q&A string and per-block field mappings) */
  allBlocks: Array<{ id: string; type: string; content: any }>;
  /** The block that was submitted (form block) */
  landingBlock: { id: string; type: string; content: any } | null;
  /** Telegram subscriber context — present when visitor came via bot link */
  subscriberContext?: SubscriberContext;
}

export interface LandingBitrixResult {
  ok: boolean;
  contactId: string | null;
  dealId: string | null;
  /** What happened to the deal */
  action: "created" | "updated" | "skipped";
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** System deal fields that must never be overwritten during duplicate merge */
const MERGE_SKIP_KEYS = new Set([
  "ID", "TITLE", "DATE_CREATE", "STAGE_ID", "CATEGORY_ID",
  "IS_RECURRING", "IS_RETURN_CUSTOMER", "IS_REPEATED_APPROACH",
  "CREATED_BY_ID", "MODIFY_BY_ID", "DATE_MODIFY",
  "OPENED", "CLOSED", "CURRENCY_ID",
]);

function isEmpty(val: unknown, key?: string): boolean {
  if (val === null || val === undefined) return true;
  if (typeof val === "string" && val.trim() === "") return true;
  if (Array.isArray(val) && val.length === 0) return true;
  if (val === "0.00") return true;
  if (key === "OPPORTUNITY" && parseFloat(val as string) === 0) return true;
  return false;
}

function buildQaString(
  data: Record<string, string>,
  answers: Record<string, any>,
  allBlocks: Array<{ id: string; content: any }>
): string {
  let qa = "";
  // Form field values
  for (const [label, value] of Object.entries(data ?? {})) {
    if (typeof value === "string" && value.trim()) {
      qa += `${label}: ${value}\n`;
    }
  }
  if (qa) qa += "\n";
  // Question-block answers
  for (const [blkId, answer] of Object.entries(answers ?? {})) {
    const block = allBlocks.find((b) => b.id === blkId);
    if (block && (block.content as any)?.html) {
      const q = (block.content as any).html.replace(/<[^>]*>?/gm, " ").trim();
      qa += `Вопрос: ${q}\nОтвет: ${answer}\n\n`;
    }
  }
  return qa;
}

function buildExtraFields(
  pageSettings: any,
  qaString: string,
  data: Record<string, string>,
  answers: Record<string, any>,
  allBlocks: Array<{ id: string; type: string; content: any }>,
  landingBlock: { id: string; type: string; content: any } | null
): Record<string, unknown> {
  const fields: Record<string, unknown> = {};

  // Global answer field (single field for all Q&A)
  if (pageSettings?.bitrix?.globalAnswerFieldId) {
    fields[pageSettings.bitrix.globalAnswerFieldId] = qaString;
  }

  // Per text-with-answer block mappings
  for (const [blkId, answer] of Object.entries(answers ?? {})) {
    const block = allBlocks.find((b) => b.id === blkId);
    if (block) {
      const content = block.content as any;
      if (content?.bitrixFieldId && typeof answer === "string") {
        fields[content.bitrixFieldId] = answer;
      }
    }
  }

  // Per form-field mappings (from the submitting form block)
  if (landingBlock?.type === "form" && landingBlock.content) {
    const content = landingBlock.content as any;
    if (Array.isArray(content.fields)) {
      for (const [label, value] of Object.entries(data ?? {})) {
        const fieldDef = content.fields.find((f: any) => f.label === label);
        if (fieldDef?.bitrixFieldId && typeof value === "string") {
          fields[fieldDef.bitrixFieldId] = value;
        }
      }
    }
  }

  return fields;
}

// ─────────────────────────────────────────────────────────────────────────────
// Subscriber context helpers
// ─────────────────────────────────────────────────────────────────────────────

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];

/**
 * Extract UTM parameters from subscriber variables (both top-level and nested).
 */
function extractUtm(variables: Record<string, unknown>): Record<string, string> {
  const utm: Record<string, string> = {};
  for (const key of UTM_KEYS) {
    const val = variables[key];
    if (typeof val === "string" && val.trim()) utm[key] = val.trim();
  }
  return utm;
}

/**
 * Build a human-readable summary of the Telegram subscriber origin for deal
 * comments / extra fields.
 */
function buildSubscriberNote(ctx: SubscriberContext): string {
  const lines: string[] = ["📱 **Telegram-подписчик**"];
  const name = [ctx.firstName, ctx.lastName].filter(Boolean).join(" ");
  if (name) lines.push(`Имя: ${name}`);
  if (ctx.username) lines.push(`@${ctx.username}`);
  lines.push(`Chat ID: ${ctx.chatId}`);
  if (ctx.botTitle) lines.push(`Бот: ${ctx.botTitle}${ctx.botUsername ? ` (@${ctx.botUsername})` : ""}`);

  const utm = extractUtm(ctx.variables);
  if (Object.keys(utm).length > 0) {
    lines.push("");
    lines.push("UTM:");
    for (const [k, v] of Object.entries(utm)) lines.push(`  ${k}: ${v}`);
  }

  if (ctx.firstTouchSlug) {
    lines.push("");
    lines.push(`Первое касание: /${ctx.firstTouchSlug}${ctx.firstTouchAt ? ` (${ctx.firstTouchAt.toLocaleDateString("ru-RU")})` : ""}`);
  }
  if (ctx.lastTouchSlug && ctx.lastTouchSlug !== ctx.firstTouchSlug) {
    lines.push(`Последнее касание: /${ctx.lastTouchSlug}${ctx.lastTouchAt ? ` (${ctx.lastTouchAt.toLocaleDateString("ru-RU")})` : ""}`);
  }

  if (ctx.tags.length > 0) lines.push(`Теги: ${ctx.tags.join(", ")}`);

  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Main sync function
// ─────────────────────────────────────────────────────────────────────────────

export async function syncLandingToBitrix(
  input: LandingBitrixInput
): Promise<LandingBitrixResult> {
  const {
    webhookUrl,
    funnelId,
    stageId,
    pageSettings,
    landingTitle,
    fullName,
    email,
    phone,
    data,
    answers,
    allBlocks,
    landingBlock,
    subscriberContext,
  } = input;

  // Ensure base URL ends with /
  const base = webhookUrl.endsWith("/") ? webhookUrl : webhookUrl + "/";

  try {
    // ── 1. Find or create Bitrix24 contact ────────────────────────────────

    let contactId: string | null = null;

    if (email) {
      try {
        const found = await bitrixCall(base, "crm.contact.list", {
          filter: { EMAIL: email },
          select: ["ID"],
        });
        contactId = found?.[0]?.ID ?? null;
      } catch {}
    }
    if (!contactId && phone) {
      try {
        const found = await bitrixCall(base, "crm.contact.list", {
          filter: { PHONE: phone },
          select: ["ID"],
        });
        contactId = found?.[0]?.ID ?? null;
      } catch {}
    }

    if (!contactId) {
      const newContact: Record<string, unknown> = {
        NAME: fullName || "Студент",
        EMAIL: [{ VALUE: email, VALUE_TYPE: "WORK" }],
        SOURCE_ID: subscriberContext ? "BOTCLIENT" : "WEB",
        OPENED: "Y",
      };
      if (phone) newContact["PHONE"] = [{ VALUE: phone, VALUE_TYPE: "WORK" }];
      // Enrich contact with Telegram username if available
      if (subscriberContext?.username) {
        newContact["IM"] = [{ VALUE: `@${subscriberContext.username}`, VALUE_TYPE: "TELEGRAM" }];
      }
      contactId = String(
        await bitrixCall(base, "crm.contact.add", { fields: newContact })
      );
    }

    if (!contactId) {
      return { ok: false, contactId: null, dealId: null, action: "skipped", error: "Не удалось создать/найти контакт" };
    }

    // ── 2. Build stage sort map (for right-hand logic) ────────────────────

    const stageSortMap: Record<string, number> = {};
    try {
      const isDefault = String(funnelId) === "0";
      const stages = isDefault
        ? await bitrixCall(base, "crm.status.list", { filter: { ENTITY_ID: "DEAL_STAGE" } })
        : await bitrixCall(base, "crm.dealcategory.stage.list", { id: funnelId });
      for (const s of stages ?? []) {
        stageSortMap[s.STATUS_ID || s.ID] = parseInt(s.SORT ?? 0);
      }
    } catch {}

    // ── 3. Fetch open deals for this contact in the target funnel ─────────

    let openDeals: any[] = [];
    try {
      openDeals =
        (await bitrixCall(base, "crm.deal.list", {
          filter: { CONTACT_ID: contactId, CLOSED: "N", CATEGORY_ID: funnelId },
          select: ["ID", "TITLE", "STAGE_ID", "CATEGORY_ID", "DATE_CREATE", "UF_*"],
          order: { ID: "ASC" },
        })) ?? [];
    } catch {}

    // ── 4. Right-hand logic: pick master (highest stage sort, then newest ID) ─

    let masterDealId: string | null = null;
    if (openDeals.length > 0) {
      let master = openDeals[0];
      let maxSort = stageSortMap[master.STAGE_ID] ?? -1;
      for (const deal of openDeals) {
        const sort = stageSortMap[deal.STAGE_ID] ?? -1;
        if (
          sort > maxSort ||
          (sort === maxSort && parseInt(deal.ID) > parseInt(master.ID))
        ) {
          maxSort = sort;
          master = deal;
        }
      }
      masterDealId = master.ID;
    }

    // ── 5. Build field mappings and Q&A ───────────────────────────────────

    const qaString = buildQaString(data, answers, allBlocks);
    const extraFields = buildExtraFields(pageSettings, qaString, data, answers, allBlocks, landingBlock);

    // Merge subscriber UTM variables into deal extra fields if configured
    if (subscriberContext) {
      const utm = extractUtm(subscriberContext.variables);
      const utmFieldMap: Record<string, string> = pageSettings?.bitrix?.utmFieldMap ?? {};
      for (const [utmKey, fieldId] of Object.entries(utmFieldMap)) {
        if (utm[utmKey]) extraFields[fieldId] = utm[utmKey];
      }
      // tgChatIdFieldId: optional custom field for storing Telegram chat ID
      if (pageSettings?.bitrix?.tgChatIdFieldId) {
        extraFields[pageSettings.bitrix.tgChatIdFieldId] = subscriberContext.chatId;
      }
    }

    const subscriberNote = subscriberContext ? "\n\n" + buildSubscriberNote(subscriberContext) : "";
    const comment = `📢 **Новая активность**\nКлиент отправил форму: "${landingTitle}"\n\n${qaString}${subscriberNote}`;

    if (masterDealId) {
      // ── 6a. Update master deal + merge duplicates + close leftovers ───────

      const duplicates = openDeals.filter((d) => d.ID !== masterDealId);
      const mergedFields: Record<string, unknown> = { ...extraFields, STAGE_ID: stageId };

      // Deep merge field values from older duplicates into master
      if (duplicates.length > 0) {
        let masterFull: any = null;
        try {
          masterFull = await bitrixCall(base, "crm.deal.get", { id: masterDealId });
        } catch {}

        if (masterFull) {
          for (const dup of duplicates) {
            let dupFull: any = null;
            try {
              dupFull = await bitrixCall(base, "crm.deal.get", { id: dup.ID });
            } catch {}
            if (!dupFull) continue;

            for (const [key, val] of Object.entries(dupFull)) {
              if (MERGE_SKIP_KEYS.has(key)) continue;
              if (!isEmpty(val, key) && isEmpty(masterFull[key], key)) {
                mergedFields[key] = val;
                masterFull[key] = val; // optimistic: don't overwrite with next dup
              }
            }
          }
        }
      }

      await bitrixCall(base, "crm.deal.update", {
        id: masterDealId,
        fields: mergedFields,
      }).catch(() => {});

      await bitrixCall(base, "crm.timeline.comment.add", {
        fields: {
          ENTITY_ID: Number(masterDealId),
          ENTITY_TYPE: "DEAL",
          COMMENT: comment,
        },
      }).catch(() => {});

      // Close duplicates
      if (duplicates.length > 0) {
        let mergeComment =
          "🔗 **Автоматическая склейка (Right-Hand Logic)**\nЗакрыты дублирующие сделки:\n";
        for (const dup of duplicates) {
          const cat = dup.CATEGORY_ID || 0;
          const loseStage = String(cat) === "0" ? "LOSE" : `C${cat}:LOSE`;
          await bitrixCall(base, "crm.deal.update", {
            id: dup.ID,
            fields: { STAGE_ID: loseStage, CLOSED: "Y" },
          }).catch(() => {});
          mergeComment += `- Сделка #${dup.ID} (${dup.TITLE})\n`;
        }
        await bitrixCall(base, "crm.timeline.comment.add", {
          fields: {
            ENTITY_ID: Number(masterDealId),
            ENTITY_TYPE: "DEAL",
            COMMENT: mergeComment,
          },
        }).catch(() => {});
      }

      return { ok: true, contactId, dealId: masterDealId, action: "updated" };
    } else {
      // ── 6b. Create new deal ───────────────────────────────────────────────

      const dealTitle = `Сдал ДЗ [${landingTitle}]`;
      const dealFields: Record<string, unknown> = {
        TITLE: dealTitle,
        CATEGORY_ID: funnelId,
        STAGE_ID: stageId,
        CONTACT_ID: contactId,
        OPENED: "Y",
        ...extraFields,
      };

      const dealId = String(
        await bitrixCall(base, "crm.deal.add", { fields: dealFields })
      );

      return { ok: true, contactId, dealId, action: "created" };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[landings/bitrix-sync]", msg);
    return { ok: false, contactId: null, dealId: null, action: "skipped", error: msg };
  }
}
