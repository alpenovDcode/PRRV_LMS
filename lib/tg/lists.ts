// List membership mutations + reactive trigger firing.
//
// A "list" is a named bucket of subscribers (TgList). Adding/removing
// a subscriber here fires the `list_joined` / `list_left` triggers
// across all active flows in the bot, mirroring SaleBot's
// "Список → Реакция на добавление" model.
//
// We also expose `addTagWithTriggers` / `removeTagWithTriggers` which
// fire the corresponding `tag_added` / `tag_removed` triggers. The
// existing engine helpers update the tags column directly; this layer
// is the trigger-aware wrapper to use from new code.

import { db } from "../db";
import { triggersSchema, triggerAdvanced } from "./flow-schema";
import { startFlowRun } from "./flow-engine";
import { trackEvent } from "./events";

// -- list membership ----------------------------------------------------

export async function addSubscriberToList(args: {
  botId: string;
  listId: string;
  subscriberId: string;
}): Promise<{ added: boolean }> {
  const existing = await db.tgSubscriberList.findUnique({
    where: {
      listId_subscriberId: { listId: args.listId, subscriberId: args.subscriberId },
    },
  });
  if (existing) return { added: false };
  await db.tgSubscriberList.create({
    data: { listId: args.listId, subscriberId: args.subscriberId },
  });
  await db.tgList.update({
    where: { id: args.listId },
    data: { memberCount: { increment: 1 } },
  });
  trackEvent({
    type: "subscriber.list_joined",
    botId: args.botId,
    subscriberId: args.subscriberId,
    properties: { listId: args.listId },
  }).catch(() => {});
  await fireListTriggers(args.botId, args.subscriberId, "list_joined", args.listId);
  return { added: true };
}

export async function removeSubscriberFromList(args: {
  botId: string;
  listId: string;
  subscriberId: string;
}): Promise<{ removed: boolean }> {
  const existing = await db.tgSubscriberList.findUnique({
    where: {
      listId_subscriberId: { listId: args.listId, subscriberId: args.subscriberId },
    },
  });
  if (!existing) return { removed: false };
  await db.tgSubscriberList.delete({ where: { id: existing.id } });
  await db.tgList.update({
    where: { id: args.listId },
    data: { memberCount: { decrement: 1 } },
  });
  trackEvent({
    type: "subscriber.list_left",
    botId: args.botId,
    subscriberId: args.subscriberId,
    properties: { listId: args.listId },
  }).catch(() => {});
  await fireListTriggers(args.botId, args.subscriberId, "list_left", args.listId);
  return { removed: true };
}

export async function moveSubscriberToList(args: {
  botId: string;
  fromListId: string;
  toListId: string;
  subscriberId: string;
}): Promise<void> {
  await removeSubscriberFromList({
    botId: args.botId,
    listId: args.fromListId,
    subscriberId: args.subscriberId,
  });
  await addSubscriberToList({
    botId: args.botId,
    listId: args.toListId,
    subscriberId: args.subscriberId,
  });
}

export async function isSubscriberInList(
  listId: string,
  subscriberId: string,
): Promise<boolean> {
  const row = await db.tgSubscriberList.findUnique({
    where: { listId_subscriberId: { listId, subscriberId } },
    select: { id: true },
  });
  return Boolean(row);
}

// -- trigger dispatch ---------------------------------------------------

// Walks all active flows of the bot, finds triggers of type
// `triggerType` matching `payload`, and starts a flow_run per match.
// Honours priority + onlyOnce semantics shared with text triggers.
async function fireListTriggers(
  botId: string,
  subscriberId: string,
  triggerType: "list_joined" | "list_left",
  listId: string,
): Promise<void> {
  const sub = await db.tgSubscriber.findUnique({ where: { id: subscriberId } });
  if (!sub || sub.isBlocked) return;
  const flows = await db.tgFlow.findMany({ where: { botId, isActive: true } });
  const firedOnce = new Set<string>(sub.firedOnceTriggers ?? []);
  const matched: Array<{ flowId: string; triggerIndex: number; priority: number; onlyOnce: boolean }> = [];
  for (const flow of flows) {
    const parsed = triggersSchema.safeParse(flow.triggers);
    if (!parsed.success) continue;
    parsed.data.forEach((trigger, idx) => {
      // Tag triggers live elsewhere; list triggers we match here. The
      // schema added `list_joined` / `list_left` types in this iter.
      if (trigger.type !== triggerType) return;
      const adv = triggerAdvanced(trigger);
      const onceKey = `${flow.id}:${idx}`;
      if (adv.onlyOnce && firedOnce.has(onceKey)) return;
      matched.push({ flowId: flow.id, triggerIndex: idx, priority: adv.priority, onlyOnce: adv.onlyOnce });
    });
  }
  matched.sort((a, b) => b.priority - a.priority);
  const newOnceKeys: string[] = [];
  for (const m of matched.slice(0, 3)) {
    await startFlowRun({
      flowId: m.flowId,
      subscriberId,
      triggerInfo: { triggerType, listId },
    });
    if (m.onlyOnce) newOnceKeys.push(`${m.flowId}:${m.triggerIndex}`);
  }
  if (newOnceKeys.length > 0) {
    await db.tgSubscriber.update({
      where: { id: subscriberId },
      data: { firedOnceTriggers: { push: newOnceKeys } },
    });
  }
}

// Fires tag_added / tag_removed triggers. Called by the new engine
// helpers below so any tag mutation routes through one place.
export async function fireTagTriggers(args: {
  botId: string;
  subscriberId: string;
  tag: string;
  kind: "tag_added" | "tag_removed";
}): Promise<void> {
  const sub = await db.tgSubscriber.findUnique({ where: { id: args.subscriberId } });
  if (!sub || sub.isBlocked) return;
  const flows = await db.tgFlow.findMany({ where: { botId: args.botId, isActive: true } });
  const firedOnce = new Set<string>(sub.firedOnceTriggers ?? []);
  const matched: Array<{ flowId: string; triggerIndex: number; priority: number; onlyOnce: boolean }> = [];
  for (const flow of flows) {
    const parsed = triggersSchema.safeParse(flow.triggers);
    if (!parsed.success) continue;
    parsed.data.forEach((trigger, idx) => {
      if (trigger.type !== args.kind) return;
      if (trigger.tag !== args.tag) return;
      const adv = triggerAdvanced(trigger);
      const onceKey = `${flow.id}:${idx}`;
      if (adv.onlyOnce && firedOnce.has(onceKey)) return;
      matched.push({ flowId: flow.id, triggerIndex: idx, priority: adv.priority, onlyOnce: adv.onlyOnce });
    });
  }
  matched.sort((a, b) => b.priority - a.priority);
  const newOnceKeys: string[] = [];
  for (const m of matched.slice(0, 3)) {
    await startFlowRun({
      flowId: m.flowId,
      subscriberId: args.subscriberId,
      triggerInfo: { triggerType: args.kind, tag: args.tag },
    });
    if (m.onlyOnce) newOnceKeys.push(`${m.flowId}:${m.triggerIndex}`);
  }
  if (newOnceKeys.length > 0) {
    await db.tgSubscriber.update({
      where: { id: args.subscriberId },
      data: { firedOnceTriggers: { push: newOnceKeys } },
    });
  }
}
