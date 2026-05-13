// Flow execution engine.
//
// Two entry points:
//   - startFlowRun(...)   creates a queued run for a subscriber and runs one tick
//   - resumeFlowRun(...)  advances an existing run (called by cron tick or by
//                         inbound when wait_reply receives a reply)
//
// State machine for tg_flow_runs.status:
//   queued        -> processing immediately
//   running       -> currently executing a node (held briefly)
//   sleeping      -> delay node, resume_at set
//   waiting_reply -> wait_reply node, resume_at = timeout, waiting_for_var set
//   completed     -> reached an end node
//   failed        -> unrecoverable error (last_error set)
//   cancelled     -> manually stopped (or position-change cancellation in Iter 1)
//
// Concurrency: we use a coarse-grained Prisma update with a status check
// to claim a run for processing. Multiple ticks racing on the same run
// are rare in practice; if they happen, both will harmlessly send (we
// don't dedupe sends in MVP).
//
// Position model (Iter 1, SaleBot equivalent "позиция воронки"):
//   When a subscriber reaches a positional message node (isPosition!==false),
//   the engine:
//     1. Sets subscriber.currentPositionFlowId/NodeId on TgSubscriber.
//     2. Cancels every `sleeping` / `waiting_reply` run for that subscriber
//        whose `positionGroupId` references the OLD position, except the
//        run that's actively advancing.
//   This implements the "dozhim auto-cancel" behaviour: schedule a follow-up
//   from Step A with a 2-day delay; if the subscriber enters Step B in the
//   meantime, the follow-up auto-cancels and never sends.

import { db } from "../db";
import { flowGraphSchema, type FlowGraph, type FlowNode, isPositionalNode } from "./flow-schema";
import { sendBotMessage } from "./sender";
import {
  buildEvalContext,
  snapBot,
  snapSubscriber,
  snapRun,
  evalConditionExpr,
  evalValueExpr,
  renderTemplate,
  type SubscriberSnapshot,
  type BotSnapshot,
  type RunSnapshot,
} from "./vars";
import type { EvalContext } from "./expr";
import { trackEvent } from "./events";
import {
  addSubscriberToList,
  removeSubscriberFromList,
  fireTagTriggers,
} from "./lists";
import { rewriteUrlButtons } from "./redirect-tracking";
import { executeInlineActions } from "./inline-actions";
import type { Prisma, TgBot, TgSubscriber, TgFlow, TgFlowRun } from "@prisma/client";

interface RunBundle {
  run: TgFlowRun;
  flow: TgFlow;
  subscriber: TgSubscriber;
  bot: TgBot;
  graph: FlowGraph;
}

function parseGraph(flow: TgFlow): FlowGraph {
  const parsed = flowGraphSchema.safeParse(flow.graph);
  if (!parsed.success) {
    throw new Error(`flow ${flow.id} has invalid graph: ${parsed.error.message}`);
  }
  return parsed.data;
}

function findNode(graph: FlowGraph, id: string | null | undefined): FlowNode | undefined {
  if (!id) return undefined;
  return graph.nodes.find((n) => n.id === id);
}

async function buildCtxAsync(bundle: RunBundle, inboundText?: string | null): Promise<EvalContext> {
  const memberships = await db.tgSubscriberList.findMany({
    where: { subscriberId: bundle.subscriber.id },
    select: { listId: true },
  });
  return buildEvalContext({
    subscriber: snapSubscriber(bundle.subscriber),
    bot: snapBot(bundle.bot),
    run: snapRun(bundle.run),
    inboundText,
    listMembershipIds: memberships.map((m) => m.listId),
  });
}

// Sync variant kept for paths that don't need list-membership lookup.
function buildCtx(bundle: RunBundle, inboundText?: string | null): EvalContext {
  return buildEvalContext({
    subscriber: snapSubscriber(bundle.subscriber),
    bot: snapBot(bundle.bot),
    run: snapRun(bundle.run),
    inboundText,
  });
}

// -- variable persistence with scope routing ------------------------

// Parses `client.x`, `project.x`, `deal.x`, `field.x` keys. Default
// scope when no prefix is specified is `client` (most common case).
function parseScopedKey(raw: string): { scope: "client" | "project" | "deal" | "field"; key: string } {
  const m = /^(client|project|deal|field|vars)\.(.+)$/.exec(raw);
  if (!m) return { scope: "client", key: raw };
  const scope = m[1] === "vars" ? "client" : (m[1] as "client" | "project" | "deal" | "field");
  return { scope, key: m[2] };
}

async function setVarScoped(
  bundle: RunBundle,
  rawKey: string,
  value: unknown,
): Promise<{ ok: boolean; reason?: string }> {
  const { scope, key } = parseScopedKey(rawKey);
  const { run, subscriber, bot } = bundle;
  // Custom-field writes go through the type validator so e.g. an
  // email field rejects "не email", and a select field rejects values
  // not in the option list. If validation fails, we DON'T write; the
  // caller decides what to do (typically: re-prompt the user).
  if (scope === "field") {
    const field = await db.tgCustomField.findFirst({
      where: { botId: bot.id, key },
    });
    if (field) {
      const { validateCustomFieldValue } = await import("./custom-fields-validator");
      const result = validateCustomFieldValue(field, value);
      if (!result.ok) return { ok: false, reason: result.reason };
      value = result.value;
    }
  }
  if (scope === "client") {
    const cur = (subscriber.variables as Record<string, unknown>) ?? {};
    const next = { ...cur, [key]: value };
    await db.tgSubscriber.update({
      where: { id: subscriber.id },
      data: { variables: next as Prisma.InputJsonValue },
    });
    bundle.subscriber.variables = next as object;
  } else if (scope === "field") {
    const cur = (subscriber.customFields as Record<string, unknown>) ?? {};
    const next = { ...cur, [key]: value };
    await db.tgSubscriber.update({
      where: { id: subscriber.id },
      data: { customFields: next as Prisma.InputJsonValue },
    });
    bundle.subscriber.customFields = next as object;
  } else if (scope === "project") {
    const cur = (bot.projectVariables as Record<string, unknown>) ?? {};
    const next = { ...cur, [key]: value };
    await db.tgBot.update({
      where: { id: bot.id },
      data: { projectVariables: next as Prisma.InputJsonValue },
    });
    bundle.bot.projectVariables = next as object;
  } else if (scope === "deal") {
    const cur = (run.context as Record<string, unknown>) ?? {};
    const next = { ...cur, [key]: value };
    await db.tgFlowRun.update({
      where: { id: run.id },
      data: { context: next as Prisma.InputJsonValue },
    });
    bundle.run.context = next as object;
  }
  trackEvent({
    type: "subscriber.variable_set",
    botId: bot.id,
    subscriberId: subscriber.id,
    properties: { scope, key, value },
  }).catch(() => {});
  return { ok: true };
}

async function addTag(subscriberId: string, tag: string, botId: string) {
  const sub = await db.tgSubscriber.findUnique({ where: { id: subscriberId } });
  if (!sub) return;
  if (sub.tags.includes(tag)) return;
  await db.tgSubscriber.update({
    where: { id: subscriberId },
    data: { tags: { push: tag } },
  });
  trackEvent({
    type: "subscriber.tag_added",
    botId,
    subscriberId,
    properties: { tag },
  }).catch(() => {});
  // Fire tag_added triggers across all active flows of this bot.
  await fireTagTriggers({ botId, subscriberId, tag, kind: "tag_added" });
}

async function removeTag(subscriberId: string, tag: string, botId: string) {
  const sub = await db.tgSubscriber.findUnique({ where: { id: subscriberId } });
  if (!sub) return;
  if (!sub.tags.includes(tag)) return;
  await db.tgSubscriber.update({
    where: { id: subscriberId },
    data: { tags: sub.tags.filter((t) => t !== tag) },
  });
  trackEvent({
    type: "subscriber.tag_removed",
    botId,
    subscriberId,
    properties: { tag },
  }).catch(() => {});
  await fireTagTriggers({ botId, subscriberId, tag, kind: "tag_removed" });
}

// -- condition rule evaluator (extended for numeric ops + expr) -----

function getVarValue(sub: SubscriberSnapshot, bot: BotSnapshot, run: RunSnapshot | undefined, key: string): unknown {
  const { scope, key: k } = parseScopedKey(key);
  if (scope === "client") return sub.variables[k];
  if (scope === "field") return sub.customFields[k];
  if (scope === "project") return bot.projectVariables[k];
  if (scope === "deal") return run?.context[k];
  return undefined;
}

function evalRule(
  rule: { kind: string; params: Record<string, unknown> },
  ctx: { sub: SubscriberSnapshot; bot: BotSnapshot; run: RunSnapshot | undefined; evalCtx: EvalContext },
): boolean {
  if (rule.kind === "always") return true;
  if (rule.kind === "tag") {
    const op = String(rule.params.op ?? "has");
    const val = String(rule.params.value ?? "");
    const has = ctx.sub.tags.includes(val);
    return op === "has" ? has : !has;
  }
  if (rule.kind === "expr") {
    const expr = String(rule.params.expr ?? "");
    if (!expr) return false;
    return evalConditionExpr(expr, ctx.evalCtx);
  }
  if (rule.kind === "variable") {
    const key = String(rule.params.key ?? "");
    const op = String(rule.params.op ?? "eq");
    const expected = rule.params.value;
    const actual = getVarValue(ctx.sub, ctx.bot, ctx.run, key);
    if (op === "exists") return actual !== undefined && actual !== null && actual !== "";
    if (op === "not_exists") return actual === undefined || actual === null || actual === "";
    if (actual === undefined || actual === null) return false;
    if (op === "gt" || op === "gte" || op === "lt" || op === "lte") {
      const an = parseFloat(String(actual));
      const en = parseFloat(String(expected));
      if (!Number.isFinite(an) || !Number.isFinite(en)) return false;
      if (op === "gt") return an > en;
      if (op === "gte") return an >= en;
      if (op === "lt") return an < en;
      if (op === "lte") return an <= en;
    }
    const aStr = String(actual);
    const eStr = expected == null ? "" : String(expected);
    if (op === "eq") return aStr === eStr;
    if (op === "ne") return aStr !== eStr;
    if (op === "contains") return aStr.toLowerCase().includes(eStr.toLowerCase());
  }
  return false;
}

// -- regex validation -----------------------------------------------

function checkValidation(
  node: Extract<FlowNode, { type: "wait_reply" }>,
  text: string,
): { ok: boolean; reason?: string } {
  if (!node.validation) return { ok: true };
  try {
    const flags = node.validation.flags ?? "i";
    const re = new RegExp(node.validation.pattern, flags);
    if (re.test(text)) return { ok: true };
    return { ok: false, reason: "pattern_mismatch" };
  } catch {
    // Bad regex — fail open so a broken validator doesn't trap users.
    return { ok: true };
  }
}

// -- position model -------------------------------------------------

// Cancel sleeping / waiting runs that were scheduled FROM a position
// the subscriber has now left. The run actively being advanced is
// excluded by id so it can continue its work.
async function cancelPositionBoundRuns(
  subscriberId: string,
  oldPositionNodeId: string | null,
  excludeRunId: string,
): Promise<number> {
  if (!oldPositionNodeId) return 0;
  const cancelled = await db.tgFlowRun.updateMany({
    where: {
      subscriberId,
      positionGroupId: oldPositionNodeId,
      id: { not: excludeRunId },
      status: { in: ["sleeping", "waiting_reply", "queued"] },
    },
    data: {
      status: "cancelled",
      lastError: "position changed",
      finishedAt: new Date(),
    },
  });
  return cancelled.count;
}

async function enterPosition(bundle: RunBundle, node: FlowNode): Promise<void> {
  if (!isPositionalNode(node)) return;
  const { subscriber, flow } = bundle;
  const previousPosition = subscriber.currentPositionNodeId;
  if (previousPosition === node.id && subscriber.currentPositionFlowId === flow.id) {
    return;
  }
  await db.tgSubscriber.update({
    where: { id: subscriber.id },
    data: {
      currentPositionFlowId: flow.id,
      currentPositionNodeId: node.id,
      currentPositionAt: new Date(),
    },
  });
  bundle.subscriber.currentPositionFlowId = flow.id;
  bundle.subscriber.currentPositionNodeId = node.id;
  bundle.subscriber.currentPositionAt = new Date();

  if (previousPosition && previousPosition !== node.id) {
    const cancelled = await cancelPositionBoundRuns(subscriber.id, previousPosition, bundle.run.id);
    if (cancelled > 0) {
      trackEvent({
        type: "flow.position_runs_cancelled",
        botId: bundle.bot.id,
        subscriberId: subscriber.id,
        properties: { fromNode: previousPosition, toNode: node.id, count: cancelled },
      }).catch(() => {});
    }
  }
  trackEvent({
    type: "flow.position_entered",
    botId: bundle.bot.id,
    subscriberId: subscriber.id,
    properties: { flowId: flow.id, nodeId: node.id, previousNodeId: previousPosition },
  }).catch(() => {});
}

// -- node executor --------------------------------------------------

async function executeNode(
  bundle: RunBundle,
  node: FlowNode,
): Promise<{ done: boolean; nextNodeId?: string | null }> {
  const { run, subscriber, bot } = bundle;

  // Apply position-change side effects BEFORE running the node so the
  // dozhim cancellation lands before any new messages go out.
  await enterPosition(bundle, node);

  trackEvent({
    type: "flow.node_executed",
    botId: bot.id,
    subscriberId: subscriber.id,
    properties: { flowId: bundle.flow.id, nodeId: node.id, nodeType: node.type },
  }).catch(() => {});

  switch (node.type) {
    case "note":
      // Pure editor annotation — walk past it.
      return { done: false, nextNodeId: node.next };
    case "message": {
      const ctx = buildCtx(bundle);
      // Rewrite URL-buttons to /r/<slug> so we can attribute clicks.
      // Buttons w/o url, or with trackClicks=false, pass through.
      const payload = await rewriteUrlButtons({
        payload: node.payload,
        botId: bot.id,
        subscriberId: subscriber.id,
        flowId: bundle.flow.id,
        nodeId: node.id,
      });
      const res = await sendBotMessage({
        botId: bot.id,
        encryptedToken: bot.tokenEncrypted,
        subscriberId: subscriber.id,
        chatId: subscriber.chatId,
        payload,
        renderCtx: ctx,
        sourceType: "flow",
        sourceId: `${bundle.flow.id}:${node.id}`,
      });
      if (!res.ok && res.blocked) return { done: true };
      // Iter 5 — inline `onSend` bundle. Replaces having to chain
      // separate add_tag / set_variable / list nodes after each message.
      if (res.ok && node.payload.onSend) {
        await executeInlineActions(node.payload.onSend, {
          botId: bot.id,
          subscriberId: subscriber.id,
          runId: run.id,
          evalCtx: ctx,
        });
      }
      return { done: false, nextNodeId: node.next };
    }
    case "actions": {
      // Standalone "side-effects only" node. Rare — usually onSend
      // covers it — but kept for macros without an adjacent message.
      const ctx = await buildCtxAsync(bundle);
      await executeInlineActions(node.actions, {
        botId: bot.id,
        subscriberId: subscriber.id,
        runId: run.id,
        evalCtx: ctx,
      });
      return { done: false, nextNodeId: node.next };
    }
    case "delay": {
      const resumeAt = new Date(Date.now() + node.seconds * 1000);
      await db.tgFlowRun.update({
        where: { id: run.id },
        data: {
          status: "sleeping",
          resumeAt,
          currentNodeId: node.id,
          positionGroupId: subscriber.currentPositionNodeId ?? null,
        },
      });
      return { done: true };
    }
    case "wait_reply": {
      const resumeAt = new Date(Date.now() + node.timeoutSeconds * 1000);
      await db.tgFlowRun.update({
        where: { id: run.id },
        data: {
          status: "waiting_reply",
          resumeAt,
          currentNodeId: node.id,
          waitingForVar: node.saveAs,
          positionGroupId: subscriber.currentPositionNodeId ?? null,
        },
      });
      return { done: true };
    }
    case "condition": {
      const ctx = await buildCtxAsync(bundle);
      const evalArgs = {
        sub: snapSubscriber(subscriber),
        bot: snapBot(bot),
        run: snapRun(run),
        evalCtx: ctx,
      };
      for (const rule of node.rules) {
        if (evalRule(rule, evalArgs)) {
          return { done: false, nextNodeId: rule.next };
        }
      }
      return { done: false, nextNodeId: node.defaultNext ?? null };
    }
    case "add_tag":
      await addTag(subscriber.id, node.tag, bot.id);
      return { done: false, nextNodeId: node.next };
    case "remove_tag":
      await removeTag(subscriber.id, node.tag, bot.id);
      return { done: false, nextNodeId: node.next };
    case "add_to_list":
      await addSubscriberToList({
        botId: bot.id,
        listId: node.listId,
        subscriberId: subscriber.id,
      });
      return { done: false, nextNodeId: node.next };
    case "remove_from_list":
      await removeSubscriberFromList({
        botId: bot.id,
        listId: node.listId,
        subscriberId: subscriber.id,
      });
      return { done: false, nextNodeId: node.next };
    case "set_variable": {
      const ctx = buildCtx(bundle);
      let value: unknown;
      if (node.asExpression) {
        try {
          value = evalValueExpr(node.value, ctx);
        } catch {
          value = "";
        }
      } else {
        value = renderTemplate(node.value, ctx);
      }
      await setVarScoped(bundle, node.key, value);
      return { done: false, nextNodeId: node.next };
    }
    case "http_request": {
      try {
        const ctx = buildCtx(bundle);
        const url = renderTemplate(node.url, ctx);
        const body = node.body ? renderTemplate(node.body, ctx) : undefined;
        const headers = Object.fromEntries(
          Object.entries(node.headers ?? {}).map(([k, v]) => [k, renderTemplate(v, ctx)])
        );
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 15_000);
        const res = await fetch(url, {
          method: node.method,
          headers: { "Content-Type": "application/json", ...headers },
          body: node.method === "GET" ? undefined : body,
          signal: ctrl.signal,
        });
        clearTimeout(timer);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        if (node.saveAs) {
          let parsed: unknown;
          const text = await res.text();
          try {
            parsed = JSON.parse(text);
          } catch {
            parsed = text;
          }
          const newCtx = {
            ...((run.context as Record<string, unknown>) ?? {}),
            [node.saveAs]: parsed,
          };
          await db.tgFlowRun.update({
            where: { id: run.id },
            data: { context: newCtx as Prisma.InputJsonValue },
          });
          bundle.run.context = newCtx as object;
        }
        return { done: false, nextNodeId: node.next };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (node.onError) {
          await db.tgFlowRun.update({
            where: { id: run.id },
            data: { lastError: `http_request: ${msg}` },
          });
          return { done: false, nextNodeId: node.onError };
        }
        await db.tgFlowRun.update({
          where: { id: run.id },
          data: { status: "failed", lastError: `http_request: ${msg}`, finishedAt: new Date() },
        });
        trackEvent({
          type: "flow.failed",
          botId: bot.id,
          subscriberId: subscriber.id,
          properties: { flowId: bundle.flow.id, nodeId: node.id, error: msg },
        }).catch(() => {});
        return { done: true };
      }
    }
    case "goto_flow": {
      await db.tgFlowRun.update({
        where: { id: run.id },
        data: { status: "completed", finishedAt: new Date() },
      });
      await startFlowRun({
        flowId: node.flowId,
        subscriberId: subscriber.id,
        triggerInfo: { triggerType: "goto_flow", sourceFlowId: bundle.flow.id },
      });
      return { done: true };
    }
    case "end":
    default:
      await db.tgFlowRun.update({
        where: { id: run.id },
        data: { status: "completed", finishedAt: new Date() },
      });
      await db.tgFlow.update({
        where: { id: bundle.flow.id },
        data: { totalCompleted: { increment: 1 } },
      });
      trackEvent({
        type: "flow.completed",
        botId: bot.id,
        subscriberId: subscriber.id,
        properties: { flowId: bundle.flow.id },
      }).catch(() => {});
      return { done: true };
  }
}

async function tickRun(runId: string, maxSteps = 50): Promise<void> {
  const claimed = await db.tgFlowRun.updateMany({
    where: { id: runId, status: { in: ["queued", "sleeping", "waiting_reply"] } },
    data: { status: "running" },
  });
  if (claimed.count === 0) return;

  const run = await db.tgFlowRun.findUnique({ where: { id: runId } });
  if (!run) return;
  const flow = await db.tgFlow.findUnique({ where: { id: run.flowId } });
  if (!flow) return;
  const subscriber = await db.tgSubscriber.findUnique({ where: { id: run.subscriberId } });
  if (!subscriber) return;
  const bot = await db.tgBot.findUnique({ where: { id: flow.botId } });
  if (!bot) return;

  let graph: FlowGraph;
  try {
    graph = parseGraph(flow);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.tgFlowRun.update({
      where: { id: runId },
      data: { status: "failed", lastError: msg, finishedAt: new Date() },
    });
    return;
  }

  if (subscriber.isBlocked) {
    await db.tgFlowRun.update({
      where: { id: runId },
      data: { status: "cancelled", lastError: "subscriber blocked bot", finishedAt: new Date() },
    });
    return;
  }

  const bundle: RunBundle = { run, flow, subscriber, bot, graph };
  let nextId: string | null | undefined = run.currentNodeId ?? graph.startNodeId;

  let steps = 0;
  while (nextId && steps < maxSteps) {
    const node = findNode(graph, nextId);
    if (!node) {
      await db.tgFlowRun.update({
        where: { id: runId },
        data: {
          status: "failed",
          lastError: `node not found: ${nextId}`,
          finishedAt: new Date(),
        },
      });
      return;
    }
    bundle.run.currentNodeId = node.id;
    const stepRes = await executeNode(bundle, node);
    if (stepRes.done) return;
    nextId = stepRes.nextNodeId ?? null;
    steps++;
  }

  if (steps >= maxSteps) {
    await db.tgFlowRun.update({
      where: { id: runId },
      data: {
        status: "failed",
        lastError: "max steps exceeded — possible loop",
        finishedAt: new Date(),
      },
    });
  } else if (!nextId) {
    await db.tgFlowRun.update({
      where: { id: runId },
      data: { status: "completed", finishedAt: new Date() },
    });
    await db.tgFlow.update({
      where: { id: flow.id },
      data: { totalCompleted: { increment: 1 } },
    });
  }
}

export async function startFlowRun(args: {
  flowId: string;
  subscriberId: string;
  triggerInfo?: Record<string, unknown>;
}): Promise<TgFlowRun | null> {
  const flow = await db.tgFlow.findUnique({ where: { id: args.flowId } });
  if (!flow || !flow.isActive) return null;
  const subscriber = await db.tgSubscriber.findUnique({ where: { id: args.subscriberId } });
  if (!subscriber || subscriber.isBlocked) return null;

  const run = await db.tgFlowRun.create({
    data: {
      flowId: flow.id,
      subscriberId: subscriber.id,
      status: "queued",
      context: (args.triggerInfo ?? {}) as object,
      // Inherit subscriber's current position so any wait/sleep this run
      // schedules can be auto-cancelled if the subscriber moves on.
      positionGroupId: subscriber.currentPositionNodeId ?? null,
    },
  });
  await db.tgFlow.update({
    where: { id: flow.id },
    data: { totalEntered: { increment: 1 } },
  });
  trackEvent({
    type: "flow.entered",
    botId: flow.botId,
    subscriberId: subscriber.id,
    properties: { flowId: flow.id, ...(args.triggerInfo ?? {}) },
  }).catch(() => {});
  await tickRun(run.id);
  return db.tgFlowRun.findUnique({ where: { id: run.id } });
}

export async function resumeFlowRun(runId: string): Promise<void> {
  await tickRun(runId);
}

// Called by inbound handler when subscriber sends a text reply.
// If there's an active wait_reply run, validate (optionally), save,
// and advance.
export async function deliverReplyToWaitingRun(args: {
  subscriberId: string;
  botId: string;
  text: string;
}): Promise<boolean> {
  const run = await db.tgFlowRun.findFirst({
    where: { subscriberId: args.subscriberId, status: "waiting_reply" },
    orderBy: { startedAt: "desc" },
  });
  if (!run || !run.waitingForVar) return false;
  const flow = await db.tgFlow.findUnique({ where: { id: run.flowId } });
  if (!flow) return false;
  const graph = parseGraph(flow);
  const node = findNode(graph, run.currentNodeId);
  if (!node || node.type !== "wait_reply") return false;

  // Run regex validation if configured.
  const v = checkValidation(node, args.text);
  if (!v.ok) {
    const subscriber = await db.tgSubscriber.findUnique({ where: { id: args.subscriberId } });
    const bot = await db.tgBot.findUnique({ where: { id: args.botId } });
    if (subscriber && bot && node.validation?.errorMessage) {
      const evalCtx = buildEvalContext({
        subscriber: snapSubscriber(subscriber),
        bot: snapBot(bot),
        run: snapRun(run),
        inboundText: args.text,
      });
      const rendered = renderTemplate(node.validation.errorMessage, evalCtx);
      await sendBotMessage({
        botId: bot.id,
        encryptedToken: bot.tokenEncrypted,
        subscriberId: subscriber.id,
        chatId: subscriber.chatId,
        payload: { text: rendered },
        renderCtx: evalCtx,
        sourceType: "flow",
        sourceId: `${flow.id}:${node.id}:invalid`,
      });
    }
    trackEvent({
      type: "flow.wait_reply_invalid",
      botId: args.botId,
      subscriberId: args.subscriberId,
      properties: { flowId: flow.id, nodeId: node.id },
    }).catch(() => {});
    const invalidNext = node.validation?.onInvalidNext;
    if (invalidNext) {
      await db.tgFlowRun.update({
        where: { id: run.id },
        data: {
          currentNodeId: invalidNext,
          status: "queued",
          waitingForVar: null,
          resumeAt: null,
        },
      });
      await tickRun(run.id);
    } else {
      // Stay parked at the wait_reply node — next message gets validated again.
      await db.tgFlowRun.update({
        where: { id: run.id },
        data: { status: "waiting_reply" },
      });
    }
    return true;
  }

  // Persist the reply into the chosen scope, then advance.
  const flowBot = await db.tgBot.findUnique({ where: { id: flow.botId } });
  const sub = await db.tgSubscriber.findUnique({ where: { id: args.subscriberId } });
  if (!flowBot || !sub) return false;
  const saveResult = await setVarScoped(
    { bot: flowBot, subscriber: sub, run, flow, graph } as RunBundle,
    run.waitingForVar,
    args.text,
  );
  if (!saveResult.ok) {
    // Treat custom-field validation errors like regex-validation errors:
    // tell the user what's wrong, then either jump to onInvalidNext or
    // stay parked at the wait_reply node.
    if (saveResult.reason) {
      const evalCtx = buildEvalContext({
        subscriber: snapSubscriber(sub),
        bot: snapBot(flowBot),
        run: snapRun(run),
        inboundText: args.text,
      });
      await sendBotMessage({
        botId: flowBot.id,
        encryptedToken: flowBot.tokenEncrypted,
        subscriberId: sub.id,
        chatId: sub.chatId,
        payload: { text: saveResult.reason },
        renderCtx: evalCtx,
        sourceType: "flow",
        sourceId: `${flow.id}:${node.id}:field-invalid`,
      });
    }
    const invalidNext = node.validation?.onInvalidNext;
    if (invalidNext) {
      await db.tgFlowRun.update({
        where: { id: run.id },
        data: { currentNodeId: invalidNext, status: "queued", waitingForVar: null, resumeAt: null },
      });
      await tickRun(run.id);
    } else {
      await db.tgFlowRun.update({
        where: { id: run.id },
        data: { status: "waiting_reply" },
      });
    }
    return true;
  }

  // Iter 5 — inline `onSave` bundle. Run AFTER the variable lands so
  // tag/list ops can reference the just-saved value via templates.
  if (node.onSave) {
    const evalCtx = buildEvalContext({
      subscriber: snapSubscriber(sub),
      bot: snapBot(flowBot),
      run: snapRun(run),
      inboundText: args.text,
    });
    await executeInlineActions(node.onSave, {
      botId: flowBot.id,
      subscriberId: sub.id,
      runId: run.id,
      evalCtx,
    });
  }

  const nextNodeId = node.next ?? null;
  await db.tgFlowRun.update({
    where: { id: run.id },
    data: {
      currentNodeId: nextNodeId,
      status: "queued",
      waitingForVar: null,
      resumeAt: null,
    },
  });
  await tickRun(run.id);
  return true;
}

export async function deliverButtonClickToWaitingRun(args: {
  subscriberId: string;
  botId: string;
  callbackData: string;
  // Telegram message_id of the message containing the clicked button.
  // Used to reverse-look-up the source flow/node so we can execute
  // the button's inline onClick bundle (Iter 5).
  tgMessageId?: string;
}): Promise<boolean> {
  // Iter 5 — Inline onClick handler. Format: `act:<r>:<c>`. We resolve
  // the source message via tgMessageId → tgMessage.sourceId → flow + node,
  // then read node.payload.buttonRows[r][c].onClick.
  if (args.callbackData.startsWith("act:") && args.tgMessageId) {
    const parts = args.callbackData.split(":");
    const r = parseInt(parts[1] ?? "", 10);
    const c = parseInt(parts[2] ?? "", 10);
    if (Number.isNaN(r) || Number.isNaN(c)) return false;
    const tgMsg = await db.tgMessage.findFirst({
      where: {
        botId: args.botId,
        subscriberId: args.subscriberId,
        tgMessageId: args.tgMessageId,
      },
    });
    if (!tgMsg || !tgMsg.sourceId) return false;
    const [flowId, nodeId] = tgMsg.sourceId.split(":");
    if (!flowId || !nodeId) return false;
    const flow = await db.tgFlow.findUnique({ where: { id: flowId } });
    if (!flow) return false;
    let graph: FlowGraph;
    try {
      graph = parseGraph(flow);
    } catch {
      return false;
    }
    const node = findNode(graph, nodeId);
    if (!node || node.type !== "message") return false;
    const row = node.payload.buttonRows?.[r];
    const button = row?.[c];
    if (!button?.onClick) return false;
    // Build a transient eval context so templates inside onClick can
    // reference current subscriber state.
    const subscriber = await db.tgSubscriber.findUnique({ where: { id: args.subscriberId } });
    const bot = await db.tgBot.findUnique({ where: { id: args.botId } });
    if (!subscriber || !bot) return false;
    const evalCtx = buildEvalContext({
      subscriber: snapSubscriber(subscriber),
      bot: snapBot(bot),
      run: undefined,
    });
    await executeInlineActions(button.onClick, {
      botId: args.botId,
      subscriberId: args.subscriberId,
      evalCtx,
    });
    return true;
  }
  if (args.callbackData.startsWith("goto:")) {
    const flowId = args.callbackData.substring(5);
    await startFlowRun({
      flowId,
      subscriberId: args.subscriberId,
      triggerInfo: { triggerType: "button_callback" },
    });
    return true;
  }
  if (args.callbackData.startsWith("tag:add:")) {
    await addTag(args.subscriberId, args.callbackData.substring(8), args.botId);
    return true;
  }
  if (args.callbackData.startsWith("tag:rm:")) {
    await removeTag(args.subscriberId, args.callbackData.substring(7), args.botId);
    return true;
  }
  return false;
}

export async function processDueRuns(maxBatch = 100): Promise<{ processed: number }> {
  const due = await db.tgFlowRun.findMany({
    where: {
      OR: [
        { status: "queued" },
        { status: "sleeping", resumeAt: { lte: new Date() } },
        { status: "waiting_reply", resumeAt: { lte: new Date() } },
      ],
    },
    orderBy: { startedAt: "asc" },
    take: maxBatch,
  });
  let processed = 0;
  for (const r of due) {
    if (r.status === "waiting_reply") {
      const flow = await db.tgFlow.findUnique({ where: { id: r.flowId } });
      if (!flow) continue;
      const graph = parseGraph(flow);
      const node = findNode(graph, r.currentNodeId);
      const next = node && node.type === "wait_reply" ? node.timeoutNext ?? null : null;
      await db.tgFlowRun.update({
        where: { id: r.id },
        data: {
          currentNodeId: next,
          status: next ? "queued" : "completed",
          finishedAt: next ? undefined : new Date(),
          waitingForVar: null,
          resumeAt: null,
        },
      });
      if (next) await tickRun(r.id);
    } else {
      await tickRun(r.id);
    }
    processed++;
  }
  return { processed };
}
