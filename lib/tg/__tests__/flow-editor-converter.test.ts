import { describe, expect, it } from "vitest";
import {
  graphToReactFlow,
  reactFlowToGraph,
  TRIGGER_NODE_ID,
  type EditorNode,
  type EditorEdge,
} from "../flow-editor-converter";
import { TEMPLATE_FLOWS } from "../flow-templates";
import type { FlowGraph, FlowNode, FlowTrigger } from "../flow-schema";

// Sort and shallow-strip undefined to make deep-equal robust.
function normalizeGraph(g: FlowGraph): FlowGraph {
  return {
    version: g.version,
    startNodeId: g.startNodeId,
    nodes: [...g.nodes]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((n) => stripUndefined(n)),
  };
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    out[k] = v;
  }
  return out as T;
}

describe("tg/flow-editor-converter", () => {
  it("emits a trigger node for every template", () => {
    for (const t of TEMPLATE_FLOWS) {
      const { nodes, edges } = graphToReactFlow(t.graph, t.triggers, {
        autoLayout: true,
      });
      expect(nodes.find((n) => n.id === TRIGGER_NODE_ID)).toBeTruthy();
      // Trigger → start edge exists.
      const triggerEdge = edges.find((e) => e.source === TRIGGER_NODE_ID);
      expect(triggerEdge?.target).toBe(t.graph.startNodeId);
      // Every schema node is present.
      for (const n of t.graph.nodes) {
        expect(nodes.find((x) => x.id === n.id)).toBeTruthy();
      }
    }
  });

  it("round-trips every built-in template", () => {
    for (const t of TEMPLATE_FLOWS) {
      const { nodes, edges } = graphToReactFlow(t.graph, t.triggers, {
        autoLayout: true,
      });
      const back = reactFlowToGraph(nodes, edges);
      expect(back.warnings, `template ${t.id}: ${back.warnings.join("; ")}`).toEqual(
        []
      );
      expect(normalizeGraph(back.graph)).toEqual(normalizeGraph(t.graph));
      expect(back.triggers).toEqual(t.triggers);
    }
  });

  it("encodes condition rule edges with sourceHandle = rule-<idx>", () => {
    const graph: FlowGraph = {
      version: 1,
      startNodeId: "cond",
      nodes: [
        {
          id: "cond",
          type: "condition",
          rules: [
            { kind: "tag", params: { op: "has", value: "warm" }, next: "warm" },
            { kind: "always", params: {}, next: "cold" },
          ],
          defaultNext: "fallback",
        },
        {
          id: "warm",
          type: "message",
          payload: { text: "warm" },
          next: "end",
        },
        {
          id: "cold",
          type: "message",
          payload: { text: "cold" },
          next: "end",
        },
        {
          id: "fallback",
          type: "message",
          payload: { text: "fallback" },
          next: "end",
        },
        { id: "end", type: "end" },
      ],
    };
    const { edges } = graphToReactFlow(graph, []);
    expect(edges.find((e) => e.sourceHandle === "rule-0")?.target).toBe("warm");
    expect(edges.find((e) => e.sourceHandle === "rule-1")?.target).toBe("cold");
    expect(edges.find((e) => e.sourceHandle === "default")?.target).toBe(
      "fallback"
    );
  });

  it("encodes wait_reply edges (reply + timeout)", () => {
    const graph: FlowGraph = {
      version: 1,
      startNodeId: "wait",
      nodes: [
        {
          id: "wait",
          type: "wait_reply",
          saveAs: "answer",
          timeoutSeconds: 3600,
          next: "thanks",
          timeoutNext: "missed",
        },
        {
          id: "thanks",
          type: "message",
          payload: { text: "thanks" },
          next: "end",
        },
        {
          id: "missed",
          type: "message",
          payload: { text: "missed" },
          next: "end",
        },
        { id: "end", type: "end" },
      ],
    };
    const { edges } = graphToReactFlow(graph, []);
    expect(edges.find((e) => e.sourceHandle === "reply")?.target).toBe("thanks");
    expect(edges.find((e) => e.sourceHandle === "timeout")?.target).toBe(
      "missed"
    );
    const back = reactFlowToGraph(
      graphToReactFlow(graph, []).nodes,
      edges
    );
    expect(back.warnings).toEqual([]);
    expect(normalizeGraph(back.graph)).toEqual(normalizeGraph(graph));
  });

  it("encodes http_request edges (ok + error)", () => {
    const graph: FlowGraph = {
      version: 1,
      startNodeId: "h",
      nodes: [
        {
          id: "h",
          type: "http_request",
          method: "GET",
          url: "https://example.com",
          next: "ok",
          onError: "err",
        },
        {
          id: "ok",
          type: "message",
          payload: { text: "ok" },
          next: "end",
        },
        {
          id: "err",
          type: "message",
          payload: { text: "err" },
          next: "end",
        },
        { id: "end", type: "end" },
      ],
    };
    const out = graphToReactFlow(graph, []);
    expect(out.edges.find((e) => e.sourceHandle === "ok")?.target).toBe("ok");
    expect(out.edges.find((e) => e.sourceHandle === "error")?.target).toBe(
      "err"
    );
    const back = reactFlowToGraph(out.nodes, out.edges);
    expect(back.warnings).toEqual([]);
    expect(normalizeGraph(back.graph)).toEqual(normalizeGraph(graph));
  });

  it("auto-layout positions trigger above start node", () => {
    const t = TEMPLATE_FLOWS[0];
    const { nodes } = graphToReactFlow(t.graph, t.triggers, { autoLayout: true });
    const trig = nodes.find((n) => n.id === TRIGGER_NODE_ID);
    const start = nodes.find((n) => n.id === t.graph.startNodeId);
    expect(trig).toBeTruthy();
    expect(start).toBeTruthy();
    expect(trig!.position.y).toBeLessThan(start!.position.y);
  });

  it("reports warnings for an invalid graph (condition without rules)", () => {
    const badNode = {
      id: "cond",
      type: "condition",
      rules: [],
      defaultNext: undefined,
    } as unknown as FlowNode;
    const editorNodes: EditorNode[] = [
      {
        id: TRIGGER_NODE_ID,
        type: "trigger",
        position: { x: 0, y: 0 },
        data: { triggers: [], startNodeId: "cond" },
      },
      {
        id: "cond",
        type: "condition",
        position: { x: 0, y: 0 },
        data: { schemaNode: badNode },
      },
    ];
    const editorEdges: EditorEdge[] = [
      {
        id: "e-trig",
        source: TRIGGER_NODE_ID,
        target: "cond",
      },
    ];
    const out = reactFlowToGraph(editorNodes, editorEdges);
    expect(out.warnings.length).toBeGreaterThan(0);
  });

  it("reports warnings for dangling references", () => {
    const editorNodes: EditorNode[] = [
      {
        id: TRIGGER_NODE_ID,
        type: "trigger",
        position: { x: 0, y: 0 },
        data: { triggers: [], startNodeId: "msg" },
      },
      {
        id: "msg",
        type: "message",
        position: { x: 0, y: 0 },
        data: {
          schemaNode: {
            id: "msg",
            type: "message",
            payload: { text: "hello" },
            next: "does-not-exist",
          },
        },
      },
    ];
    // No outbound edge — but the schemaNode still has the bogus reference,
    // which we should NOT preserve, because reactFlowToGraph derives `next`
    // from edges. So actually warnings should be EMPTY here (the bogus
    // reference is stripped). Verify that.
    const noEdges: EditorEdge[] = [
      { id: "trig", source: TRIGGER_NODE_ID, target: "msg" },
    ];
    const clean = reactFlowToGraph(editorNodes, noEdges);
    expect(clean.warnings).toEqual([]);

    // Now add an edge whose target is missing.
    const editorEdges: EditorEdge[] = [
      { id: "trig", source: TRIGGER_NODE_ID, target: "msg" },
      { id: "bogus", source: "msg", target: "phantom" },
    ];
    const dirty = reactFlowToGraph(editorNodes, editorEdges);
    expect(dirty.warnings.some((w) => w.includes("phantom"))).toBe(true);
  });

  it("handles the minimal empty-flow case (just an end node)", () => {
    const graph: FlowGraph = {
      version: 1,
      startNodeId: "end",
      nodes: [{ id: "end", type: "end" }],
    };
    const triggers: FlowTrigger[] = [];
    const out = graphToReactFlow(graph, triggers, { autoLayout: true });
    expect(out.nodes).toHaveLength(2); // trigger + end
    expect(out.edges).toHaveLength(1); // trigger -> end
    const back = reactFlowToGraph(out.nodes, out.edges);
    expect(back.warnings).toEqual([]);
    expect(normalizeGraph(back.graph)).toEqual(normalizeGraph(graph));
  });
});
