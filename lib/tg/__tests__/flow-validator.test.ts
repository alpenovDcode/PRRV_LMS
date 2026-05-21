import { describe, it, expect } from "vitest";
import { validateFlow } from "../flow-validator";
import type { FlowGraph, FlowTrigger } from "../flow-schema";

// Минимальный helper, чтобы тесты были читаемы.
function endNode(id = "end") {
  return { id, type: "end" as const, label: "Конец" };
}

describe("validateFlow", () => {
  it("warns when there are no triggers", () => {
    const graph: FlowGraph = {
      version: 1,
      startNodeId: "end",
      nodes: [endNode()],
    };
    const issues = validateFlow(graph, []);
    expect(issues.find((i) => i.code === "NO_TRIGGERS")).toBeTruthy();
  });

  it("flags wait_reply without timeout or timeoutNext", () => {
    const graph: FlowGraph = {
      version: 1,
      startNodeId: "wait",
      nodes: [
        {
          id: "wait",
          type: "wait_reply",
          saveAs: "deal.x",
          timeoutSeconds: 0,
          next: "end",
        },
        endNode(),
      ],
    };
    const triggers: FlowTrigger[] = [{ type: "command", command: "start" }];
    const issues = validateFlow(graph, triggers);
    expect(issues.find((i) => i.code === "WAIT_REPLY_NO_TIMEOUT")).toBeTruthy();
  });

  it("flags split with duplicate branch labels", () => {
    const graph: FlowGraph = {
      version: 1,
      startNodeId: "s",
      nodes: [
        {
          id: "s",
          type: "split",
          branches: [
            { label: "A", weight: 1, next: "end" },
            { label: "A", weight: 1, next: "end" },
          ],
        },
        endNode(),
      ],
    };
    const triggers: FlowTrigger[] = [{ type: "command", command: "start" }];
    const issues = validateFlow(graph, triggers);
    expect(issues.find((i) => i.code === "SPLIT_DUPLICATE_LABELS")).toBeTruthy();
  });

  it("flags condition without defaultNext", () => {
    const graph: FlowGraph = {
      version: 1,
      startNodeId: "c",
      nodes: [
        {
          id: "c",
          type: "condition",
          rules: [{ kind: "always", params: {}, next: "end" }],
        },
        endNode(),
      ],
    };
    const triggers: FlowTrigger[] = [{ type: "command", command: "start" }];
    const issues = validateFlow(graph, triggers);
    expect(issues.find((i) => i.code === "CONDITION_NO_DEFAULT")).toBeTruthy();
  });

  it("flags message that reaches no exit (no next, no exit button)", () => {
    const graph: FlowGraph = {
      version: 1,
      startNodeId: "m",
      nodes: [
        {
          id: "m",
          type: "message",
          payload: { text: "hi" },
        },
      ],
    };
    const triggers: FlowTrigger[] = [{ type: "command", command: "start" }];
    const issues = validateFlow(graph, triggers);
    expect(issues.find((i) => i.code === "MESSAGE_DEAD_END")).toBeTruthy();
  });

  it("does NOT flag MESSAGE_DEAD_END if message has a URL button", () => {
    const graph: FlowGraph = {
      version: 1,
      startNodeId: "m",
      nodes: [
        {
          id: "m",
          type: "message",
          payload: {
            text: "hi",
            buttonRows: [[{ text: "Открыть", url: "https://example.com" }]],
          },
        },
      ],
    };
    const triggers: FlowTrigger[] = [{ type: "command", command: "start" }];
    const issues = validateFlow(graph, triggers);
    expect(issues.find((i) => i.code === "MESSAGE_DEAD_END")).toBeFalsy();
  });

  it("flags unreachable nodes", () => {
    const graph: FlowGraph = {
      version: 1,
      startNodeId: "a",
      nodes: [
        { id: "a", type: "message", payload: { text: "hi" }, next: "end" },
        endNode(),
        { id: "orphan", type: "message", payload: { text: "никто меня не позовёт" }, next: "end" },
      ],
    };
    const triggers: FlowTrigger[] = [{ type: "command", command: "start" }];
    const issues = validateFlow(graph, triggers);
    expect(
      issues.find((i) => i.code === "UNREACHABLE" && i.nodeId === "orphan")
    ).toBeTruthy();
  });
});
