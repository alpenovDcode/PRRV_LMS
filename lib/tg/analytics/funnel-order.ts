// Pure helper: given a parsed flow graph, return the funnel-ordered
// list of nodes (one per id, deduplicated). Branching nodes (condition,
// http_request, wait_reply) contribute every reachable successor; we
// sort by max depth from the start node so the funnel reads top-down.
//
// We deliberately import only the TYPE — the engine guarantees the
// stored shape; re-validating in an analytics path is wasteful.

import type { FlowGraph, FlowNode } from "@/lib/tg/flow-schema";

export interface FunnelNode {
  nodeId: string;
  nodeType: FlowNode["type"];
  label: string;
  depth: number;
}

// Collect outgoing edges from a node. We touch every field that can
// reference another node so the funnel is exhaustive.
function outgoing(node: FlowNode): string[] {
  const out: string[] = [];
  if ("next" in node && node.next) out.push(node.next);
  switch (node.type) {
    case "condition": {
      for (const r of node.rules) {
        if (r.next) out.push(r.next);
      }
      if (node.defaultNext) out.push(node.defaultNext);
      break;
    }
    case "wait_reply": {
      if (node.timeoutNext) out.push(node.timeoutNext);
      break;
    }
    case "http_request": {
      if (node.onError) out.push(node.onError);
      break;
    }
    case "message": {
      // Buttons may carry goto targets.
      const rows = node.payload.buttonRows ?? [];
      for (const row of rows) {
        for (const b of row) {
          if (b.goto) out.push(b.goto);
        }
      }
      break;
    }
    default:
      break;
  }
  return out;
}

function defaultLabel(node: FlowNode): string {
  if (node.label) return node.label;
  switch (node.type) {
    case "message": {
      const txt = node.payload.text ?? "";
      const oneLine = txt.replace(/\s+/g, " ").trim();
      return oneLine.length > 50 ? oneLine.slice(0, 47) + "…" : oneLine || "Сообщение";
    }
    case "delay":
      return `Задержка ${node.seconds}с`;
    case "wait_reply":
      return `Ждём ответ → ${node.saveAs}`;
    case "condition":
      return "Условие";
    case "add_tag":
      return `+тег ${node.tag}`;
    case "remove_tag":
      return `−тег ${node.tag}`;
    case "set_variable":
      return `set ${node.key}`;
    case "http_request":
      return `HTTP ${node.method}`;
    case "goto_flow":
      return `Перейти в флоу`;
    case "end":
      return "Конец";
    default:
      return (node as { type: string }).type;
  }
}

export function orderFunnelNodes(graph: FlowGraph): FunnelNode[] {
  const byId = new Map<string, FlowNode>();
  for (const n of graph.nodes) byId.set(n.id, n);

  // BFS from startNodeId, tracking max-depth per node. Cycles are
  // handled by skipping nodes we have already enqueued at a smaller
  // depth (they cannot become deeper without cycling forever).
  const depths = new Map<string, number>();
  const queue: Array<{ id: string; depth: number }> = [
    { id: graph.startNodeId, depth: 0 },
  ];
  let safety = graph.nodes.length * 4 + 16;
  while (queue.length && safety-- > 0) {
    const { id, depth } = queue.shift()!;
    const cur = byId.get(id);
    if (!cur) continue;
    const prev = depths.get(id);
    if (prev != null && prev >= depth) continue;
    depths.set(id, depth);
    for (const nextId of outgoing(cur)) {
      queue.push({ id: nextId, depth: depth + 1 });
    }
  }

  // Include every reachable node in funnel order (depth asc, then id
  // for deterministic output).
  const result: FunnelNode[] = [];
  for (const [id, depth] of depths.entries()) {
    const node = byId.get(id);
    if (!node) continue;
    result.push({
      nodeId: id,
      nodeType: node.type,
      label: defaultLabel(node),
      depth,
    });
  }
  result.sort((a, b) => (a.depth - b.depth) || a.nodeId.localeCompare(b.nodeId));
  return result;
}
