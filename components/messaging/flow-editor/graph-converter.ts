/**
 * components/messaging/flow-editor/graph-converter.ts
 *
 * Биджективная конвертация между нашим форматом графа (хранится в БД как
 * MessagingFlow.graph) и форматом React Flow (Node[] + Edge[]).
 *
 * Наш формат:
 *   {
 *     startNodeId: "n1",
 *     nodes: {
 *       n1: { type: "send_text", text: "...", next: "n2" },
 *       n2: { type: "wait_reply", onReply: "n3", onTimeout: "n4", timeoutSec: 86400 },
 *       n3: { type: "condition", branches: [{...}], onNoMatch: "n4" },
 *       ...
 *     },
 *     positions?: { n1: {x:0,y:0}, ... }     // опционально, для UI
 *   }
 *
 * React Flow:
 *   nodes: [{ id, type, position: {x,y}, data: {...} }]
 *   edges: [{ id, source, target, sourceHandle?, label? }]
 *
 * sourceHandle используется для узлов с несколькими ветвями (wait_reply,
 * condition).
 */

import type { Edge, Node as RFNode } from "@xyflow/react";

export interface BackendGraph {
  startNodeId: string;
  nodes: Record<string, any>;
  /** Опционально: координаты узлов. Если нет — autoLayout даст grid. */
  positions?: Record<string, { x: number; y: number }>;
}

export interface ReactFlowState {
  nodes: RFNode[];
  edges: Edge[];
  startNodeId: string;
}

// ─── Backend → React Flow ──────────────────────────────────────────────────

export function toReactFlow(graph: BackendGraph): ReactFlowState {
  const positions = graph.positions ?? autoLayout(graph);

  const rfNodes: RFNode[] = Object.entries(graph.nodes).map(([id, node]) => ({
    id,
    type: node.type, // используем 'type' для подбора custom-компонента
    position: positions[id] ?? { x: 0, y: 0 },
    data: {
      ...node,
      isStart: id === graph.startNodeId,
    },
  }));

  const rfEdges: Edge[] = [];

  for (const [id, node] of Object.entries(graph.nodes)) {
    switch (node.type) {
      case "send_text":
      case "send_quick_replies":
      case "send_buttons":
      case "set_variable":
        if (node.next) {
          rfEdges.push(makeEdge(id, node.next, "next"));
        }
        break;

      case "wait_reply":
        if (node.onReply) {
          rfEdges.push(makeEdge(id, node.onReply, "onReply", "Ответил"));
        }
        if (node.onTimeout) {
          rfEdges.push(makeEdge(id, node.onTimeout, "onTimeout", "Timeout"));
        }
        break;

      case "condition":
        (node.branches ?? []).forEach((br: any, idx: number) => {
          if (br.next) {
            const label = `${br.field}=${br.value}`.slice(0, 24);
            rfEdges.push(makeEdge(id, br.next, `branch-${idx}`, label));
          }
        });
        if (node.onNoMatch) {
          rfEdges.push(makeEdge(id, node.onNoMatch, "onNoMatch", "Иначе"));
        }
        break;

      // end → нет исходящих
    }
  }

  return { nodes: rfNodes, edges: rfEdges, startNodeId: graph.startNodeId };
}

function makeEdge(source: string, target: string, sourceHandle: string, label?: string): Edge {
  return {
    id: `e-${source}-${sourceHandle}-${target}`,
    source,
    target,
    sourceHandle,
    label,
    type: "smoothstep",
    animated: false,
    style: { strokeWidth: 1.5 },
    labelStyle: { fontSize: 11, fontWeight: 500 },
  };
}

// ─── React Flow → Backend ──────────────────────────────────────────────────

export function fromReactFlow(rf: ReactFlowState): BackendGraph {
  const nodes: Record<string, any> = {};
  const positions: Record<string, { x: number; y: number }> = {};

  for (const n of rf.nodes) {
    const { isStart, ...nodeData } = n.data as any;
    nodes[n.id] = { ...nodeData };
    positions[n.id] = n.position;
  }

  // Применяем edges: проставляем next / onReply / onTimeout / branches[i].next / onNoMatch
  for (const e of rf.edges) {
    const node = nodes[e.source];
    if (!node) continue;
    const handle = e.sourceHandle ?? "next";

    switch (node.type) {
      case "send_text":
      case "send_quick_replies":
      case "send_buttons":
      case "set_variable":
        node.next = e.target;
        break;

      case "wait_reply":
        if (handle === "onReply") node.onReply = e.target;
        if (handle === "onTimeout") node.onTimeout = e.target;
        break;

      case "condition":
        if (handle === "onNoMatch") {
          node.onNoMatch = e.target;
        } else if (handle.startsWith("branch-")) {
          const idx = parseInt(handle.slice("branch-".length));
          if (!Array.isArray(node.branches)) node.branches = [];
          if (node.branches[idx]) node.branches[idx].next = e.target;
        }
        break;
    }
  }

  // Очистка не-используемых next-ссылок (если edge удалили)
  for (const id of Object.keys(nodes)) {
    const node = nodes[id];
    const handlesUsed = new Set(rf.edges.filter((e) => e.source === id).map((e) => e.sourceHandle ?? "next"));

    switch (node.type) {
      case "send_text":
      case "send_quick_replies":
      case "send_buttons":
      case "set_variable":
        if (!handlesUsed.has("next")) node.next = null;
        break;
      case "wait_reply":
        if (!handlesUsed.has("onReply")) node.onReply = null;
        if (!handlesUsed.has("onTimeout")) node.onTimeout = null;
        break;
      case "condition":
        if (!handlesUsed.has("onNoMatch")) node.onNoMatch = null;
        (node.branches ?? []).forEach((br: any, idx: number) => {
          if (!handlesUsed.has(`branch-${idx}`)) br.next = null;
        });
        break;
    }
  }

  return {
    startNodeId: rf.startNodeId,
    nodes,
    positions,
  };
}

// ─── Auto-layout (если нет сохранённых координат) ──────────────────────────

/** Простой grid-layout: BFS от startNode, по уровням. */
function autoLayout(graph: BackendGraph): Record<string, { x: number; y: number }> {
  const positions: Record<string, { x: number; y: number }> = {};
  const visited = new Set<string>();
  const queue: Array<{ id: string; depth: number }> = [{ id: graph.startNodeId, depth: 0 }];
  const byDepth: Record<number, string[]> = {};

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    if (!byDepth[depth]) byDepth[depth] = [];
    byDepth[depth].push(id);

    const node = graph.nodes[id];
    if (!node) continue;
    const successors = getSuccessors(node);
    for (const s of successors) {
      if (s && !visited.has(s)) queue.push({ id: s, depth: depth + 1 });
    }
  }

  // Дополнительно — узлы которые не достижимы из start (могут быть остатки)
  for (const id of Object.keys(graph.nodes)) {
    if (!visited.has(id)) {
      if (!byDepth[0]) byDepth[0] = [];
      byDepth[0].push(id);
    }
  }

  const X_STEP = 320;
  const Y_STEP = 180;
  for (const [depth, ids] of Object.entries(byDepth)) {
    ids.forEach((id, idx) => {
      positions[id] = { x: parseInt(depth) * X_STEP, y: idx * Y_STEP };
    });
  }

  return positions;
}

function getSuccessors(node: any): (string | null | undefined)[] {
  switch (node.type) {
    case "send_text":
    case "send_quick_replies":
    case "send_buttons":
    case "set_variable":
      return [node.next];
    case "wait_reply":
      return [node.onReply, node.onTimeout];
    case "condition":
      return [...(node.branches ?? []).map((b: any) => b.next), node.onNoMatch];
    default:
      return [];
  }
}
