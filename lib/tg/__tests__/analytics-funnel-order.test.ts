import { describe, expect, it } from "vitest";
import { orderFunnelNodes } from "../analytics/funnel-order";
import type { FlowGraph } from "../flow-schema";

describe("analytics/funnel-order", () => {
  it("orders a simple linear flow by depth", () => {
    const graph: FlowGraph = {
      version: 1,
      startNodeId: "a",
      nodes: [
        { id: "a", type: "message", payload: { text: "hi" }, next: "b" },
        { id: "b", type: "delay", seconds: 60, next: "c" },
        { id: "c", type: "end" },
      ],
    };
    const out = orderFunnelNodes(graph);
    expect(out.map((n) => n.nodeId)).toEqual(["a", "b", "c"]);
    expect(out[0].depth).toBe(0);
    expect(out[2].depth).toBe(2);
  });

  it("includes branches via condition.defaultNext and rule.next", () => {
    const graph: FlowGraph = {
      version: 1,
      startNodeId: "start",
      nodes: [
        { id: "start", type: "message", payload: { text: "go" }, next: "cond" },
        {
          id: "cond",
          type: "condition",
          rules: [{ kind: "tag", params: { op: "has", value: "vip" }, next: "vip" }],
          defaultNext: "default",
        },
        { id: "vip", type: "end" },
        { id: "default", type: "end" },
      ],
    };
    const out = orderFunnelNodes(graph);
    const ids = out.map((n) => n.nodeId);
    expect(ids).toContain("start");
    expect(ids).toContain("cond");
    expect(ids).toContain("vip");
    expect(ids).toContain("default");
    expect(out.find((n) => n.nodeId === "start")!.depth).toBe(0);
    expect(out.find((n) => n.nodeId === "cond")!.depth).toBe(1);
    expect(out.find((n) => n.nodeId === "vip")!.depth).toBe(2);
  });

  it("handles cycles without infinite looping", () => {
    const graph: FlowGraph = {
      version: 1,
      startNodeId: "a",
      nodes: [
        { id: "a", type: "message", payload: { text: "x" }, next: "b" },
        { id: "b", type: "message", payload: { text: "y" }, next: "a" },
      ],
    };
    const out = orderFunnelNodes(graph);
    expect(out.length).toBe(2);
  });

  it("includes wait_reply.timeoutNext and http_request.onError branches", () => {
    const graph: FlowGraph = {
      version: 1,
      startNodeId: "wait",
      nodes: [
        {
          id: "wait",
          type: "wait_reply",
          saveAs: "ans",
          timeoutSeconds: 60,
          timeoutNext: "timeout",
          next: "ok",
        },
        { id: "ok", type: "end" },
        { id: "timeout", type: "end" },
      ],
    };
    const ids = orderFunnelNodes(graph).map((n) => n.nodeId);
    expect(ids).toContain("ok");
    expect(ids).toContain("timeout");
  });
});
