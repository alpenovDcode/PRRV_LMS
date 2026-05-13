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
//   cancelled     -> manually stopped
//
// Concurrency: we use a coarse-grained Prisma update with a status check
// to claim a run for processing. Multiple ticks racing on the same run
// are rare in practice; if they happen, both will harmlessly send (we
// don't dedupe sends in MVP).

import { db } from "../db";
import { flowGraphSchema, type FlowGraph, type FlowNode } from "./flow-schema";
import { sendBotMessage } from "./sender";
import { renderTemplate, type RenderContext } from "./vars";
import { trackEvent } from "./events";
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

function buildRenderCtx(bundle: RunBundle): RenderContext {
  return {
    subscriber: {
      chatId: bundle.subscriber.chatId,
      firstName: bundle.subscriber.firstName,
      lastName: bundle.subscriber.lastName,
      username: bundle.subscriber.username,
      variables: (bundle.subscriber.variables ?? {}) as Record<string, unknown>,
    },
    bot: { username: bundle.bot.username, title: bundle.bot.title },
    runContext: (bundle.run.context ?? {}) as Record<string, unknown>,
  };
}

async function setVar(
  subscriberId: string,
  key: string,
  value: unknown,
  botId: string
) {
  const sub = await db.tgSubscriber.findUnique({ where: { id: subscriberId } });
  if (!sub) return;
  const vars = { ...((sub.variables as Record<string, unknown>) ?? {}), [key]: value };
  await db.tgSubscriber.update({
    where: { id: subscriberId },
    data: { variables: vars as Prisma.InputJsonValue },
  });
  trackEvent({
    type: "subscriber.variable_set",
    botId,
    subscriberId,
    properties: { key, value },
  }).catch(() => {});
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
}

function evalCondition(
  rule: { kind: string; params: Record<string, unknown> },
  subscriber: TgSubscriber
): boolean {
  if (rule.kind === "always") return true;
  if (rule.kind === "tag") {
    const op = String(rule.params.op ?? "has");
    const val = String(rule.params.value ?? "");
    const has = subscriber.tags.includes(val);
    return op === "has" ? has : !has;
  }
  if (rule.kind === "variable") {
    const key = String(rule.params.key ?? "");
    const op = String(rule.params.op ?? "eq");
    const expected = rule.params.value;
    const vars = (subscriber.variables as Record<string, unknown>) ?? {};
    const actual = vars[key];
    if (op === "exists") return actual !== undefined && actual !== null;
    if (op === "not_exists") return actual === undefined || actual === null;
    if (actual === undefined || actual === null) return false;
    const aStr = String(actual);
    const eStr = expected == null ? "" : String(expected);
    if (op === "eq") return aStr === eStr;
    if (op === "ne") return aStr !== eStr;
    if (op === "contains") return aStr.toLowerCase().includes(eStr.toLowerCase());
  }
  return false;
}

// Execute one step. Returns true if engine should immediately keep going,
// false if the run is waiting (sleep/wait_reply/end/fail).
async function executeNode(
  bundle: RunBundle,
  node: FlowNode
): Promise<{ done: boolean; nextNodeId?: string | null }> {
  const { run, subscriber, bot, graph } = bundle;
  trackEvent({
    type: "flow.node_executed",
    botId: bot.id,
    subscriberId: subscriber.id,
    properties: { flowId: bundle.flow.id, nodeId: node.id, nodeType: node.type },
  }).catch(() => {});

  switch (node.type) {
    case "message": {
      const res = await sendBotMessage({
        botId: bot.id,
        encryptedToken: bot.tokenEncrypted,
        subscriberId: subscriber.id,
        chatId: subscriber.chatId,
        payload: node.payload,
        renderCtx: buildRenderCtx(bundle),
        sourceType: "flow",
        sourceId: `${bundle.flow.id}:${node.id}`,
      });
      if (!res.ok && res.blocked) {
        return { done: true };
      }
      return { done: false, nextNodeId: node.next };
    }
    case "delay": {
      const resumeAt = new Date(Date.now() + node.seconds * 1000);
      await db.tgFlowRun.update({
        where: { id: run.id },
        data: { status: "sleeping", resumeAt, currentNodeId: node.id },
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
        },
      });
      return { done: true };
    }
    case "condition": {
      for (const rule of node.rules) {
        if (evalCondition(rule, subscriber)) {
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
    case "set_variable": {
      const rendered = renderTemplate(node.value, buildRenderCtx(bundle));
      await setVar(subscriber.id, node.key, rendered, bot.id);
      return { done: false, nextNodeId: node.next };
    }
    case "http_request": {
      try {
        const ctx = buildRenderCtx(bundle);
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
          // Update local bundle so subsequent nodes see the value.
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
      // Mark current run completed and start a new run on the target flow.
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

// Run the next sequence of nodes until we hit a wait state or end.
// Bounded by maxSteps to prevent runaway loops.
async function tickRun(runId: string, maxSteps = 50): Promise<void> {
  const claimed = await db.tgFlowRun.updateMany({
    where: { id: runId, status: { in: ["queued", "sleeping", "waiting_reply"] } },
    data: { status: "running" },
  });
  if (claimed.count === 0) return;

  let run = await db.tgFlowRun.findUnique({ where: { id: runId } });
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

  // If subscriber is blocked, abort the run early.
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
    // Walked off the graph cleanly.
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

// Called by cron tick for runs whose resumeAt has passed.
export async function resumeFlowRun(runId: string): Promise<void> {
  await tickRun(runId);
}

// Called by inbound handler when subscriber sends a text reply.
// If there's an active wait_reply run, save the text and advance.
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
  // Persist the reply into subscriber.variables.
  await setVar(args.subscriberId, run.waitingForVar, args.text, args.botId);
  // Resume from the wait_reply node — advance to its `next`.
  const flow = await db.tgFlow.findUnique({ where: { id: run.flowId } });
  if (!flow) return false;
  const graph = parseGraph(flow);
  const node = findNode(graph, run.currentNodeId);
  const nextNodeId = node && node.type === "wait_reply" ? node.next ?? null : null;
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

// Called by inbound handler when subscriber clicks a button with goto/tag.
export async function deliverButtonClickToWaitingRun(args: {
  subscriberId: string;
  botId: string;
  callbackData: string;
}): Promise<boolean> {
  // We accept "goto:<flowId>" or "node:<nodeId>" or "tag:add:<tag>" / "tag:rm:<tag>"
  // as built-in callbacks. Otherwise — no engine effect, just a logged click.
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

// Drives all pending runs whose resumeAt is due.
// Called by the cron tick endpoint.
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
      // Timed out — follow timeoutNext from the wait_reply node.
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
