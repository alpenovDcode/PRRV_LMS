import { describe, it, expect } from "vitest";
import {
  buildFlowExport,
  flowExportSchema,
  analyzeImportWarnings,
} from "../flow-export";
import type { FlowGraph, FlowTrigger } from "../flow-schema";

const trivialGraph: FlowGraph = {
  version: 1,
  startNodeId: "msg",
  nodes: [
    {
      id: "msg",
      type: "message",
      payload: { text: "hi" },
      next: "end",
    },
    { id: "end", type: "end" },
  ],
};

describe("flow-export", () => {
  it("round-trips through Zod", () => {
    const exp = buildFlowExport({
      name: "Test",
      description: "desc",
      graph: trivialGraph,
      triggers: [{ type: "command", command: "start" } as FlowTrigger],
    });
    const parsed = flowExportSchema.safeParse(exp);
    expect(parsed.success).toBe(true);
  });

  it("rejects exports with wrong formatVersion", () => {
    const bad = {
      formatVersion: 999,
      exportedAt: new Date().toISOString(),
      name: "x",
      graph: trivialGraph,
      triggers: [],
    };
    expect(flowExportSchema.safeParse(bad).success).toBe(false);
  });

  it("warns about file_id media when importing", () => {
    const exp = buildFlowExport({
      name: "Test",
      description: null,
      graph: {
        version: 1,
        startNodeId: "m",
        nodes: [
          {
            id: "m",
            type: "message",
            payload: {
              text: "hi",
              attachments: [{ kind: "photo", fileId: "AgACAg..." }],
            },
            next: "end",
          },
          { id: "end", type: "end" },
        ],
      },
      triggers: [],
    });
    const warnings = analyzeImportWarnings(exp);
    expect(warnings.find((w) => w.code === "MEDIA_FILE_ID")).toBeTruthy();
  });

  it("warns about goto_flow because flowId is bot-local", () => {
    const exp = buildFlowExport({
      name: "Test",
      description: null,
      graph: {
        version: 1,
        startNodeId: "g",
        nodes: [
          { id: "g", type: "goto_flow", flowId: "abc-123", next: undefined },
          { id: "end", type: "end" },
        ],
      },
      triggers: [],
    });
    const warnings = analyzeImportWarnings(exp);
    expect(warnings.find((w) => w.code === "GOTO_FLOW_ID")).toBeTruthy();
  });
});
