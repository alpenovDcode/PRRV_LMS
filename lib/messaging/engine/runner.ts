/**
 * lib/messaging/engine/runner.ts
 *
 * Channel-agnostic flow-engine runner.
 *
 * Жизненный цикл одного flow run:
 *
 *   trigger (webhook keyword) → startFlow() → executeNode() в цикле:
 *      send_text / send_quick_replies → execute и сразу next
 *      wait_reply → сохранить currentNodeId + status=waiting_reply, выйти
 *                    Cron позже разбудит по timeout, либо новый inbound разбудит.
 *      condition  → выбрать ветку → executeNode(branch)
 *      end        → status=completed
 *
 * При новом входящем сообщении (resumeWithInput):
 *   - Если есть active wait_reply run — записать input в context.lastInput, перейти на onReply
 *   - Если нет — попробовать триггер
 */

import { db } from "@/lib/db";
import { MessagingFlowRunStatus, type MessagingBot, type MessagingSubscriber } from "@prisma/client";
import { getBotProvider } from "@/lib/messaging/providers/factory";
import { renderTemplate } from "./template";
import { executeActions } from "./actions";
import type { FlowGraph, FlowNode, ConditionNode } from "./graph-types";

const MAX_NODES_PER_TICK = 50; // защита от бесконечных циклов в графе

export interface StartFlowOptions {
  flowId: string;
  subscriberId: string;
  /** Опционально — что положить в context перед стартом (например, trigger payload) */
  initialContext?: Record<string, unknown>;
}

/**
 * Стартует новый запуск воронки. Отменяет предыдущий running/waiting run
 * этого подписчика по этому же flow (чтобы не было дублей).
 */
export async function startFlow(opts: StartFlowOptions): Promise<string> {
  // Отменим параллельные runs того же подписчика по тому же flow
  await db.messagingFlowRun.updateMany({
    where: {
      flowId: opts.flowId,
      subscriberId: opts.subscriberId,
      status: { in: [MessagingFlowRunStatus.running, MessagingFlowRunStatus.waiting_reply] },
    },
    data: { status: MessagingFlowRunStatus.cancelled, completedAt: new Date() },
  });

  const flow = await db.messagingFlow.findUnique({ where: { id: opts.flowId } });
  if (!flow || !flow.isActive) throw new Error("Flow not found or inactive");

  const graph = flow.graph as unknown as FlowGraph;

  const run = await db.messagingFlowRun.create({
    data: {
      flowId: opts.flowId,
      subscriberId: opts.subscriberId,
      status: MessagingFlowRunStatus.running,
      currentNodeId: graph.startNodeId,
      context: (opts.initialContext ?? {}) as any,
    },
  });

  await db.messagingFlow.update({
    where: { id: opts.flowId },
    data: { runCount: { increment: 1 } },
  });

  await tickRun(run.id);
  return run.id;
}

/**
 * Возобновляет run по входящему сообщению (если есть waiting_reply).
 * Возвращает true если был resume, false если нет ожидающего run'а.
 */
export async function resumeWithInput(
  subscriberId: string,
  input: { text?: string; payload?: string }
): Promise<boolean> {
  const run = await db.messagingFlowRun.findFirst({
    where: {
      subscriberId,
      status: MessagingFlowRunStatus.waiting_reply,
    },
    orderBy: { startedAt: "desc" },
  });
  if (!run) return false;

  const flow = await db.messagingFlow.findUnique({ where: { id: run.flowId } });
  if (!flow) return false;

  const graph = flow.graph as unknown as FlowGraph;
  const waitNode = graph.nodes[run.currentNodeId ?? ""];
  if (!waitNode || waitNode.type !== "wait_reply") {
    // битое состояние — отменяем
    await db.messagingFlowRun.update({
      where: { id: run.id },
      data: { status: MessagingFlowRunStatus.cancelled, completedAt: new Date() },
    });
    return false;
  }

  // Записываем input в context
  let newContext: Record<string, unknown> = {
    ...((run.context as Record<string, unknown>) ?? {}),
    lastInput: input.text ?? "",
    lastPayload: input.payload ?? "",
  };

  // Inline-actions wait_reply узла — срабатывают при получении ответа,
  // ДО перехода на onReply. Например: после ответа добавить тег "answered".
  const waitActions = (waitNode as any).actions as
    | undefined
    | import("./graph-types").NodeAction[];
  if (waitActions && waitActions.length > 0) {
    const subWithBot = await db.messagingSubscriber.findUnique({
      where: { id: subscriberId },
      include: { bot: true },
    });
    if (subWithBot) {
      const { bot: subBot, ...subOnly } = subWithBot as any;
      const out = await executeActions(waitActions, subBot, subOnly as any, newContext);
      newContext = out.context;
    }
  }

  // Переходим на onReply
  await db.messagingFlowRun.update({
    where: { id: run.id },
    data: {
      status: MessagingFlowRunStatus.running,
      currentNodeId: waitNode.onReply,
      context: newContext as any,
      waitUntil: null,
    },
  });

  await tickRun(run.id);
  return true;
}

/**
 * Tick — выполняет узлы в цикле пока не упрётся в wait_reply / end / error.
 * Экспортируется для использования из cron (после timeout wait_reply).
 */
export async function tickRun(runId: string): Promise<void> {
  for (let i = 0; i < MAX_NODES_PER_TICK; i++) {
    const run = await db.messagingFlowRun.findUnique({
      where: { id: runId },
      include: { flow: true, subscriber: { include: { bot: true } } },
    });
    if (!run) return;
    if (run.status !== MessagingFlowRunStatus.running) return;

    const graph = run.flow.graph as unknown as FlowGraph;
    const nodeId = run.currentNodeId;
    if (!nodeId) {
      await markCompleted(runId);
      return;
    }
    const node = graph.nodes[nodeId];
    if (!node) {
      await markFailed(runId, `Node "${nodeId}" not found in graph`);
      return;
    }

    try {
      const result = await executeNode(node, run.subscriber, run.subscriber.bot, run.context as any);

      // ── Inline-actions ──────────────────────────────────────────────
      // Выполняются ПОСЛЕ основного эффекта узла, перед переходом на next.
      // Для wait_reply actions срабатывают только при resume (когда юзер
      // ответил) — здесь мы их не запускаем (kind=wait).
      const nodeActions = (node as any).actions as
        | undefined
        | import("./graph-types").NodeAction[];

      let finalContext = result.kind !== "wait" ? (result as any).context ?? run.context : run.context;
      if (nodeActions && nodeActions.length > 0 && result.kind !== "wait") {
        const { bot: _bot, ...subOnly } = run.subscriber as any;
        const out = await executeActions(
          nodeActions,
          run.subscriber.bot,
          subOnly as any,
          finalContext as Record<string, unknown>
        );
        finalContext = out.context;
      }

      if (result.kind === "advance") {
        if (!result.nextNodeId) {
          await markCompleted(runId);
          return;
        }
        await db.messagingFlowRun.update({
          where: { id: runId },
          data: { currentNodeId: result.nextNodeId, context: finalContext as any },
        });
        // продолжаем цикл
      } else if (result.kind === "wait") {
        await db.messagingFlowRun.update({
          where: { id: runId },
          data: {
            status: MessagingFlowRunStatus.waiting_reply,
            waitUntil: result.waitUntil,
          },
        });
        return;
      } else if (result.kind === "end") {
        await markCompleted(runId);
        return;
      }
    } catch (e) {
      await markFailed(runId, e instanceof Error ? e.message : String(e));
      return;
    }
  }

  // Превысили лимит итераций
  await markFailed(runId, `Exceeded ${MAX_NODES_PER_TICK} nodes per tick — возможен цикл в графе`);
}

// ─── Node executor ──────────────────────────────────────────────────────────

type ExecResult =
  | { kind: "advance"; nextNodeId: string | null; context: Record<string, unknown> }
  | { kind: "wait"; waitUntil: Date }
  | { kind: "end" };

async function executeNode(
  node: FlowNode,
  subscriber: MessagingSubscriber,
  bot: MessagingBot,
  context: Record<string, unknown>
): Promise<ExecResult> {
  const provider = getBotProvider(bot.channel);
  const tmplCtx = { subscriber, bot, context };

  switch (node.type) {
    case "send_text": {
      const text = renderTemplate(node.text, tmplCtx);
      await provider.sendText(bot, subscriber, text);
      return { kind: "advance", nextNodeId: node.next, context };
    }

    case "send_quick_replies": {
      const text = renderTemplate(node.text, tmplCtx);
      const buttons = node.buttons.map((b) => ({
        title: renderTemplate(b.title, tmplCtx),
        payload: b.payload,
      }));
      await provider.sendQuickReplies(bot, subscriber, text, buttons);
      return { kind: "advance", nextNodeId: node.next, context };
    }

    case "send_buttons": {
      const text = renderTemplate(node.text, tmplCtx);
      const buttons = node.buttons.map((b) =>
        b.type === "url"
          ? {
              type: "url" as const,
              title: renderTemplate(b.title, tmplCtx),
              url: renderTemplate(b.url, tmplCtx),
            }
          : {
              type: "postback" as const,
              title: renderTemplate(b.title, tmplCtx),
              payload: b.payload,
            }
      );
      await provider.sendButtons(bot, subscriber, text, buttons);
      return { kind: "advance", nextNodeId: node.next, context };
    }

    case "wait_reply": {
      const waitUntil = new Date(Date.now() + (node.timeoutSec ?? 86400) * 1000);
      // currentNodeId уже указывает на wait_reply — статус сменим в caller
      return { kind: "wait", waitUntil };
    }

    case "condition": {
      const matched = evalConditionBranches(node, context);
      return { kind: "advance", nextNodeId: matched, context };
    }

    case "set_variable": {
      const value = renderTemplate(node.value, tmplCtx);
      const newContext = { ...context, [node.key]: value };
      return { kind: "advance", nextNodeId: node.next, context: newContext };
    }

    case "end":
      return { kind: "end" };

    default:
      throw new Error(`Unknown node type: ${(node as any).type}`);
  }
}

function evalConditionBranches(
  node: ConditionNode,
  context: Record<string, unknown>
): string | null {
  const lastInput = String(context.lastInput ?? "");
  const lastPayload = String(context.lastPayload ?? "");

  for (const branch of node.branches) {
    const haystack = branch.field === "lastPayload" ? lastPayload : lastInput;
    const value = branch.caseSensitive ? branch.value : branch.value.toLowerCase();
    const sample = branch.caseSensitive ? haystack : haystack.toLowerCase();

    let matched = false;
    switch (branch.match) {
      case "exact":
        matched = sample === value;
        break;
      case "starts_with":
        matched = sample.startsWith(value);
        break;
      case "contains":
        matched = sample.includes(value);
        break;
      case "regex":
        try {
          matched = new RegExp(branch.value, branch.caseSensitive ? "" : "i").test(haystack);
        } catch {}
        break;
    }
    if (matched) return branch.next;
  }
  return node.onNoMatch;
}

async function markCompleted(runId: string): Promise<void> {
  await db.messagingFlowRun.update({
    where: { id: runId },
    data: {
      status: MessagingFlowRunStatus.completed,
      completedAt: new Date(),
      currentNodeId: null,
    },
  });
}

async function markFailed(runId: string, error: string): Promise<void> {
  console.error(`[flow-runner] run ${runId} failed:`, error);
  await db.messagingFlowRun.update({
    where: { id: runId },
    data: {
      status: MessagingFlowRunStatus.failed,
      completedAt: new Date(),
      lastError: error.slice(0, 500),
    },
  });
}
