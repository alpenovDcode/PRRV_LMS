import { describe, expect, it } from "vitest";
import { flowGraphSchema, triggersSchema } from "../flow-schema";
import { TEMPLATE_FLOWS } from "../flow-templates";

describe("tg/flow-schema", () => {
  it("validates a minimal graph", () => {
    const ok = flowGraphSchema.safeParse({
      version: 1,
      startNodeId: "a",
      nodes: [
        { id: "a", type: "message", payload: { text: "hi" }, next: "b" },
        { id: "b", type: "end" },
      ],
    });
    expect(ok.success).toBe(true);
  });

  it("rejects unknown node types", () => {
    const bad = flowGraphSchema.safeParse({
      version: 1,
      startNodeId: "a",
      nodes: [{ id: "a", type: "bogus" } as any],
    });
    expect(bad.success).toBe(false);
  });

  it("rejects oversized message text", () => {
    const bad = flowGraphSchema.safeParse({
      version: 1,
      startNodeId: "a",
      nodes: [
        { id: "a", type: "message", payload: { text: "a".repeat(5000) } },
      ],
    });
    expect(bad.success).toBe(false);
  });

  it("accepts every built-in template", () => {
    for (const t of TEMPLATE_FLOWS) {
      const r = flowGraphSchema.safeParse(t.graph);
      if (!r.success) {
        // eslint-disable-next-line no-console
        console.error(t.id, r.error.format());
      }
      expect(r.success).toBe(true);
      const tr = triggersSchema.safeParse(t.triggers);
      expect(tr.success).toBe(true);
    }
  });
});
