// Executor for inline action bundles (Iter 5).
//
// A bundle bundles up to 5 kinds of atomic ops; this module runs them
// in a deterministic order:
//   1. setVariables — first, so subsequent ops can reference them via
//      templates (e.g. addTags includes `{{client.utm}}`).
//   2. addTags
//   3. removeTags
//   4. addToLists
//   5. removeFromLists
//
// Failures are LOGGED but DON'T abort the bundle — a missing list id
// or a buggy template shouldn't sink the whole flow run. Engine cleanly
// proceeds to the next node.

import { db } from "../db";
import type { InlineActions } from "./flow-schema";
import {
  addSubscriberToList,
  removeSubscriberFromList,
  fireTagTriggers,
} from "./lists";
import type { EvalContext } from "./expr";
import { renderTemplate, evalValueExpr } from "./vars";
import type { Prisma } from "@prisma/client";
import { trackEvent } from "./events";

// Same scope router as flow-engine.setVarScoped. Kept inline here to
// avoid an import cycle (flow-engine imports this module).
function parseScopedKey(raw: string): { scope: "client" | "project" | "deal" | "field"; key: string } {
  const m = /^(client|project|deal|field|vars)\.(.+)$/.exec(raw);
  if (!m) return { scope: "client", key: raw };
  const scope = m[1] === "vars" ? "client" : (m[1] as "client" | "project" | "deal" | "field");
  return { scope, key: m[2] };
}

export interface InlineActionsCtx {
  botId: string;
  subscriberId: string;
  // Optional run for deal-scope variables. If absent, deal.x writes are no-ops.
  runId?: string;
  // EvalContext used to render templates inside `value` and `addTags`.
  evalCtx: EvalContext;
}

// Render any `{{...}}` placeholders in a tag/list-id template.
// Templates rarely appear in tags but power users like `addTags: ["src-{{client.utm}}"]`,
// so we support them everywhere.
function renderMaybe(s: string, evalCtx: EvalContext): string {
  if (!s.includes("{{") && !s.includes("#{")) return s;
  return renderTemplate(s, evalCtx);
}

// Persist a single variable. Schema-aware for field.x (custom fields
// run through type validator before save).
async function setVariable(
  ctx: InlineActionsCtx,
  key: string,
  value: unknown,
): Promise<{ ok: boolean; reason?: string }> {
  const { scope, key: k } = parseScopedKey(key);
  if (scope === "client") {
    const sub = await db.tgSubscriber.findUnique({ where: { id: ctx.subscriberId } });
    if (!sub) return { ok: false, reason: "subscriber not found" };
    const next = { ...((sub.variables as Record<string, unknown>) ?? {}), [k]: value };
    await db.tgSubscriber.update({
      where: { id: ctx.subscriberId },
      data: { variables: next as Prisma.InputJsonValue },
    });
  } else if (scope === "field") {
    const field = await db.tgCustomField.findFirst({
      where: { botId: ctx.botId, key: k },
    });
    let storedValue: unknown = value;
    if (field) {
      const { validateCustomFieldValue } = await import("./custom-fields-validator");
      const r = validateCustomFieldValue(field, value);
      if (!r.ok) return { ok: false, reason: r.reason };
      storedValue = r.value;
    }
    const sub = await db.tgSubscriber.findUnique({ where: { id: ctx.subscriberId } });
    if (!sub) return { ok: false, reason: "subscriber not found" };
    const next = { ...((sub.customFields as Record<string, unknown>) ?? {}), [k]: storedValue };
    await db.tgSubscriber.update({
      where: { id: ctx.subscriberId },
      data: { customFields: next as Prisma.InputJsonValue },
    });
  } else if (scope === "project") {
    const bot = await db.tgBot.findUnique({ where: { id: ctx.botId } });
    if (!bot) return { ok: false, reason: "bot not found" };
    const next = { ...((bot.projectVariables as Record<string, unknown>) ?? {}), [k]: value };
    await db.tgBot.update({
      where: { id: ctx.botId },
      data: { projectVariables: next as Prisma.InputJsonValue },
    });
  } else if (scope === "deal") {
    if (!ctx.runId) return { ok: false, reason: "no run context" };
    const run = await db.tgFlowRun.findUnique({ where: { id: ctx.runId } });
    if (!run) return { ok: false, reason: "run not found" };
    const next = { ...((run.context as Record<string, unknown>) ?? {}), [k]: value };
    await db.tgFlowRun.update({
      where: { id: ctx.runId },
      data: { context: next as Prisma.InputJsonValue },
    });
  }
  trackEvent({
    type: "subscriber.variable_set",
    botId: ctx.botId,
    subscriberId: ctx.subscriberId,
    properties: { scope, key: k, value, source: "inline" },
  }).catch(() => {});
  return { ok: true };
}

async function addTag(ctx: InlineActionsCtx, tag: string): Promise<void> {
  const sub = await db.tgSubscriber.findUnique({ where: { id: ctx.subscriberId } });
  if (!sub || sub.tags.includes(tag)) return;
  await db.tgSubscriber.update({
    where: { id: ctx.subscriberId },
    data: { tags: { push: tag } },
  });
  trackEvent({
    type: "subscriber.tag_added",
    botId: ctx.botId,
    subscriberId: ctx.subscriberId,
    properties: { tag, source: "inline" },
  }).catch(() => {});
  await fireTagTriggers({
    botId: ctx.botId,
    subscriberId: ctx.subscriberId,
    tag,
    kind: "tag_added",
  });
}

async function removeTag(ctx: InlineActionsCtx, tag: string): Promise<void> {
  const sub = await db.tgSubscriber.findUnique({ where: { id: ctx.subscriberId } });
  if (!sub || !sub.tags.includes(tag)) return;
  await db.tgSubscriber.update({
    where: { id: ctx.subscriberId },
    data: { tags: sub.tags.filter((t) => t !== tag) },
  });
  trackEvent({
    type: "subscriber.tag_removed",
    botId: ctx.botId,
    subscriberId: ctx.subscriberId,
    properties: { tag, source: "inline" },
  }).catch(() => {});
  await fireTagTriggers({
    botId: ctx.botId,
    subscriberId: ctx.subscriberId,
    tag,
    kind: "tag_removed",
  });
}

// Run a bundle. Order is fixed (see file-level docstring).
export async function executeInlineActions(
  bundle: InlineActions | undefined,
  ctx: InlineActionsCtx,
): Promise<void> {
  if (!bundle) return;

  // 1. setVariables — first, so later items can reference them.
  if (bundle.setVariables && bundle.setVariables.length > 0) {
    for (const action of bundle.setVariables) {
      try {
        const rawValue = action.asExpression
          ? evalValueExpr(action.value, ctx.evalCtx)
          : renderTemplate(action.value, ctx.evalCtx);
        await setVariable(ctx, action.key, rawValue);
      } catch (e) {
        trackEvent({
          type: "inline_action.error",
          botId: ctx.botId,
          subscriberId: ctx.subscriberId,
          properties: {
            op: "setVariable",
            key: action.key,
            error: e instanceof Error ? e.message : String(e),
          },
        }).catch(() => {});
      }
    }
  }

  // 2. addTags — supports template-rendered tag names.
  for (const tag of bundle.addTags ?? []) {
    try {
      await addTag(ctx, renderMaybe(tag, ctx.evalCtx));
    } catch {
      // swallow — see file-level "failures are logged but don't abort"
    }
  }
  // 3. removeTags
  for (const tag of bundle.removeTags ?? []) {
    try {
      await removeTag(ctx, renderMaybe(tag, ctx.evalCtx));
    } catch {
      // swallow
    }
  }
  // 4. addToLists
  for (const listId of bundle.addToLists ?? []) {
    try {
      await addSubscriberToList({
        botId: ctx.botId,
        listId: renderMaybe(listId, ctx.evalCtx),
        subscriberId: ctx.subscriberId,
      });
    } catch {
      // swallow
    }
  }
  // 5. removeFromLists
  for (const listId of bundle.removeFromLists ?? []) {
    try {
      await removeSubscriberFromList({
        botId: ctx.botId,
        listId: renderMaybe(listId, ctx.evalCtx),
        subscriberId: ctx.subscriberId,
      });
    } catch {
      // swallow
    }
  }
}
