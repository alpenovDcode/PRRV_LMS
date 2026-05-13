// Pure conversion functions between the persisted Zod schema-JSON
// (FlowGraph + FlowTrigger[]) and React-Flow's nodes/edges representation
// used by the visual editor.
//
// This module is intentionally framework-agnostic — no React imports —
// so it's trivially unit-testable with Vitest. The only React-Flow type
// surface we touch is the structural shape of `Node` and `Edge`, which
// we describe locally below to keep tests cheap.

import {
  flowGraphSchema,
  triggersSchema,
  type FlowGraph,
  type FlowNode,
  type FlowTrigger,
} from "./flow-schema";

// ---------- Local structural types (compatible with @xyflow/react) ----------

export interface EditorNodePosition {
  x: number;
  y: number;
}

export type SchemaNode = FlowNode;

// Trigger virtual node has its own shape (not part of the graph).
export interface TriggerNodeData {
  triggers: FlowTrigger[];
  startNodeId: string;
}

export interface SchemaNodeData {
  schemaNode: SchemaNode;
}

export type FlowEditorNodeData = SchemaNodeData | TriggerNodeData;

export interface EditorNode {
  id: string;
  type: string;
  position: EditorNodePosition;
  data: FlowEditorNodeData;
}

export interface EditorEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  label?: string;
}

export const TRIGGER_NODE_ID = "__trigger";

// ---------- graphToReactFlow ----------

interface GraphToRFOpts {
  autoLayout?: boolean;
  positions?: Record<string, EditorNodePosition>;
}

export function graphToReactFlow(
  graph: FlowGraph,
  triggers: FlowTrigger[],
  opts: GraphToRFOpts = {}
): { nodes: EditorNode[]; edges: EditorEdge[] } {
  const nodes: EditorNode[] = [];
  const edges: EditorEdge[] = [];

  // ---- Trigger virtual node ----
  nodes.push({
    id: TRIGGER_NODE_ID,
    type: "trigger",
    position: opts.positions?.[TRIGGER_NODE_ID] ?? { x: 0, y: 0 },
    data: { triggers: [...triggers], startNodeId: graph.startNodeId },
  });

  // Edge from trigger to the start node.
  if (graph.startNodeId) {
    edges.push({
      id: `e-${TRIGGER_NODE_ID}-${graph.startNodeId}`,
      source: TRIGGER_NODE_ID,
      target: graph.startNodeId,
    });
  }

  // ---- Schema nodes ----
  for (const node of graph.nodes) {
    nodes.push({
      id: node.id,
      type: node.type,
      position: opts.positions?.[node.id] ?? { x: 0, y: 0 },
      data: { schemaNode: node },
    });

    // Outbound edges per node-type.
    switch (node.type) {
      case "message":
      case "delay":
      case "add_tag":
      case "remove_tag":
      case "set_variable":
      case "goto_flow":
        if (node.next) {
          edges.push({
            id: `e-${node.id}-${node.next}`,
            source: node.id,
            target: node.next,
          });
        }
        break;
      case "wait_reply":
        if (node.next) {
          edges.push({
            id: `e-${node.id}-reply-${node.next}`,
            source: node.id,
            sourceHandle: "reply",
            target: node.next,
            label: "ответ",
          });
        }
        if (node.timeoutNext) {
          edges.push({
            id: `e-${node.id}-timeout-${node.timeoutNext}`,
            source: node.id,
            sourceHandle: "timeout",
            target: node.timeoutNext,
            label: "таймаут",
          });
        }
        break;
      case "condition": {
        node.rules.forEach((rule, idx) => {
          if (rule.next) {
            edges.push({
              id: `e-${node.id}-rule-${idx}-${rule.next}`,
              source: node.id,
              sourceHandle: `rule-${idx}`,
              target: rule.next,
              label: ruleLabel(rule, idx),
            });
          }
        });
        if (node.defaultNext) {
          edges.push({
            id: `e-${node.id}-default-${node.defaultNext}`,
            source: node.id,
            sourceHandle: "default",
            target: node.defaultNext,
            label: "иначе",
          });
        }
        break;
      }
      case "http_request":
        if (node.next) {
          edges.push({
            id: `e-${node.id}-ok-${node.next}`,
            source: node.id,
            sourceHandle: "ok",
            target: node.next,
            label: "ok",
          });
        }
        if (node.onError) {
          edges.push({
            id: `e-${node.id}-error-${node.onError}`,
            source: node.id,
            sourceHandle: "error",
            target: node.onError,
            label: "error",
          });
        }
        break;
      case "end":
        // no outgoing
        break;
    }
  }

  if (opts.autoLayout) {
    const positions = computeLayout(nodes, edges);
    for (const n of nodes) {
      const p = positions[n.id];
      if (p) n.position = p;
    }
  }

  return { nodes, edges };
}

function ruleLabel(
  rule: { kind: string; params: Record<string, unknown> },
  idx: number
): string {
  if (rule.kind === "always") return "всегда";
  if (rule.kind === "tag") {
    const op = String(rule.params.op ?? "has");
    const v = String(rule.params.value ?? "");
    return `${op === "has" ? "+" : "-"}тег ${v}`;
  }
  if (rule.kind === "variable") {
    const key = String(rule.params.key ?? "");
    const op = String(rule.params.op ?? "eq");
    return `${key} ${op}`;
  }
  return `rule ${idx + 1}`;
}

// ---------- reactFlowToGraph ----------

export interface ReactFlowToGraphResult {
  graph: FlowGraph;
  triggers: FlowTrigger[];
  warnings: string[];
}

export function reactFlowToGraph(
  nodes: EditorNode[],
  edges: EditorEdge[]
): ReactFlowToGraphResult {
  const warnings: string[] = [];

  const triggerNode = nodes.find((n) => n.id === TRIGGER_NODE_ID);
  const triggers: FlowTrigger[] = triggerNode
    ? [...((triggerNode.data as TriggerNodeData).triggers ?? [])]
    : [];

  const schemaNodes = nodes.filter((n) => n.id !== TRIGGER_NODE_ID);

  // Determine startNodeId: prefer the edge from trigger; otherwise prefer
  // explicit value stored on the trigger node; otherwise first node.
  let startNodeId: string | undefined;
  const triggerOut = edges.find((e) => e.source === TRIGGER_NODE_ID);
  if (triggerOut) startNodeId = triggerOut.target;
  if (!startNodeId && triggerNode) {
    startNodeId = (triggerNode.data as TriggerNodeData).startNodeId;
  }
  if (!startNodeId && schemaNodes.length > 0) {
    startNodeId = schemaNodes[0].id;
  }

  // Index outbound edges by source.
  const outBySource = new Map<string, EditorEdge[]>();
  for (const e of edges) {
    if (e.source === TRIGGER_NODE_ID) continue;
    const list = outBySource.get(e.source) ?? [];
    list.push(e);
    outBySource.set(e.source, list);
  }

  const rebuilt: FlowNode[] = schemaNodes.map((n) => {
    const original = (n.data as SchemaNodeData).schemaNode;
    const outs = outBySource.get(n.id) ?? [];

    // Clone shallowly so we don't mutate React state.
    const next = { ...original } as FlowNode;

    // Reset outbound pointers we control; then re-apply from edges.
    if (
      next.type === "message" ||
      next.type === "delay" ||
      next.type === "add_tag" ||
      next.type === "remove_tag" ||
      next.type === "set_variable" ||
      next.type === "goto_flow" ||
      next.type === "note"
    ) {
      const edge = outs.find((e) => !e.sourceHandle);
      next.next = edge?.target;
    } else if (next.type === "wait_reply") {
      const replyEdge = outs.find((e) => e.sourceHandle === "reply");
      const timeoutEdge = outs.find((e) => e.sourceHandle === "timeout");
      next.next = replyEdge?.target;
      next.timeoutNext = timeoutEdge?.target;
    } else if (next.type === "http_request") {
      const okEdge = outs.find((e) => e.sourceHandle === "ok");
      const errEdge = outs.find((e) => e.sourceHandle === "error");
      next.next = okEdge?.target;
      next.onError = errEdge?.target;
    } else if (next.type === "condition") {
      const cloned = {
        ...next,
        rules: next.rules.map((r) => ({ ...r, params: { ...r.params } })),
      };
      cloned.rules.forEach((rule, idx) => {
        const edge = outs.find((e) => e.sourceHandle === `rule-${idx}`);
        if (edge) rule.next = edge.target;
      });
      const defEdge = outs.find((e) => e.sourceHandle === "default");
      cloned.defaultNext = defEdge?.target;
      return cloned;
    }
    // end: no outbound

    return next;
  });

  const graph: FlowGraph = {
    version: 1,
    startNodeId: startNodeId ?? "",
    nodes: rebuilt,
  };

  // Validate.
  const gParse = flowGraphSchema.safeParse(graph);
  if (!gParse.success) {
    for (const issue of gParse.error.issues) {
      warnings.push(`graph: ${issue.path.join(".")} — ${issue.message}`);
    }
  }
  const tParse = triggersSchema.safeParse(triggers);
  if (!tParse.success) {
    for (const issue of tParse.error.issues) {
      warnings.push(`triggers: ${issue.path.join(".")} — ${issue.message}`);
    }
  }

  // Also reject dangling references — engine refuses them at create-time.
  const nodeIds = new Set(rebuilt.map((n) => n.id));
  if (graph.startNodeId && !nodeIds.has(graph.startNodeId)) {
    warnings.push(`graph: startNodeId "${graph.startNodeId}" не найден среди нод`);
  }
  for (const n of rebuilt) {
    const refs: Array<[string, string | undefined]> = [];
    if ("next" in n) refs.push(["next", n.next]);
    if (n.type === "wait_reply") refs.push(["timeoutNext", n.timeoutNext]);
    if (n.type === "http_request") refs.push(["onError", n.onError]);
    if (n.type === "condition") {
      refs.push(["defaultNext", n.defaultNext]);
      n.rules.forEach((r, i) => refs.push([`rules[${i}].next`, r.next]));
    }
    for (const [field, ref] of refs) {
      if (ref && !nodeIds.has(ref)) {
        warnings.push(`node "${n.id}".${field} → unknown node "${ref}"`);
      }
    }
  }

  return { graph, triggers, warnings };
}

// ---------- Auto-layout (simple BFS top-down) ----------

const V_SPACING = 200;
const H_SPACING = 280;

function computeLayout(
  nodes: EditorNode[],
  edges: EditorEdge[]
): Record<string, EditorNodePosition> {
  const adj = new Map<string, string[]>();
  const indeg = new Map<string, number>();
  for (const n of nodes) {
    adj.set(n.id, []);
    indeg.set(n.id, 0);
  }
  for (const e of edges) {
    adj.get(e.source)?.push(e.target);
    indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1);
  }

  // Compute depth via BFS starting at trigger (preferred) or any root.
  const depth = new Map<string, number>();
  const queue: string[] = [];
  if (nodes.find((n) => n.id === TRIGGER_NODE_ID)) {
    queue.push(TRIGGER_NODE_ID);
    depth.set(TRIGGER_NODE_ID, 0);
  } else {
    for (const n of nodes) {
      if ((indeg.get(n.id) ?? 0) === 0) {
        queue.push(n.id);
        depth.set(n.id, 0);
      }
    }
  }

  while (queue.length > 0) {
    const cur = queue.shift() as string;
    const d = depth.get(cur) ?? 0;
    for (const nb of adj.get(cur) ?? []) {
      const nd = d + 1;
      const prev = depth.get(nb);
      if (prev === undefined || nd > prev) {
        depth.set(nb, nd);
        queue.push(nb);
      }
    }
  }

  // Any unreached nodes get pushed to the bottom under their own column.
  let unreachedDepth = (Math.max(0, ...Array.from(depth.values())) || 0) + 1;
  for (const n of nodes) {
    if (!depth.has(n.id)) {
      depth.set(n.id, unreachedDepth);
      unreachedDepth++;
    }
  }

  // Group by depth.
  const byDepth = new Map<number, string[]>();
  for (const n of nodes) {
    const d = depth.get(n.id) ?? 0;
    const list = byDepth.get(d) ?? [];
    list.push(n.id);
    byDepth.set(d, list);
  }

  const positions: Record<string, EditorNodePosition> = {};
  const sortedDepths = Array.from(byDepth.keys()).sort((a, b) => a - b);
  for (const d of sortedDepths) {
    const ids = byDepth.get(d) ?? [];
    // Sort siblings so layout is stable: trigger first, then by node id.
    ids.sort((a, b) => {
      if (a === TRIGGER_NODE_ID) return -1;
      if (b === TRIGGER_NODE_ID) return 1;
      return a.localeCompare(b);
    });
    const total = ids.length;
    // Center the row around x=0.
    const xStart = -((total - 1) * H_SPACING) / 2;
    ids.forEach((id, idx) => {
      positions[id] = {
        x: Math.round(xStart + idx * H_SPACING),
        y: Math.round(d * V_SPACING),
      };
    });
  }

  return positions;
}

// ---------- Empty-flow helper ----------

export function emptyFlow(): { graph: FlowGraph; triggers: FlowTrigger[] } {
  return {
    graph: {
      version: 1,
      startNodeId: "end",
      nodes: [{ id: "end", type: "end", label: "Конец" }],
    },
    triggers: [],
  };
}
