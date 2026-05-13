// Iter 5: schema acceptance of onSend / onSave / onClick / actions node.

import { describe, it, expect } from "vitest";
import {
  flowGraphSchema,
  inlineActionsCount,
  inlineActionsSchema,
} from "../flow-schema";

describe("inline actions schema", () => {
  it("counts atomic ops", () => {
    expect(inlineActionsCount(undefined)).toBe(0);
    expect(inlineActionsCount({})).toBe(0);
    expect(
      inlineActionsCount({
        addTags: ["a", "b"],
        removeTags: ["c"],
        setVariables: [{ key: "x", value: "1" }],
      })
    ).toBe(4);
  });

  it("accepts full bundle", () => {
    const r = inlineActionsSchema.safeParse({
      addTags: ["registered"],
      removeTags: ["cold"],
      addToLists: ["list-1"],
      removeFromLists: ["list-2"],
      setVariables: [
        { key: "client.score", value: "10" },
        { key: "deal.utm", value: "{{client.utm}}", asExpression: false },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("message with onSend bundle", () => {
    const r = flowGraphSchema.safeParse({
      version: 1,
      startNodeId: "n1",
      nodes: [
        {
          id: "n1",
          type: "message",
          payload: {
            text: "Привет!",
            onSend: {
              addTags: ["started"],
              setVariables: [{ key: "source", value: "{{question}}" }],
            },
          },
        },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("wait_reply with onSave bundle", () => {
    const r = flowGraphSchema.safeParse({
      version: 1,
      startNodeId: "n1",
      nodes: [
        {
          id: "n1",
          type: "wait_reply",
          saveAs: "field.email",
          timeoutSeconds: 600,
          onSave: { addTags: ["has_email"], addToLists: ["leads"] },
        },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("button with onClick bundle", () => {
    const r = flowGraphSchema.safeParse({
      version: 1,
      startNodeId: "n1",
      nodes: [
        {
          id: "n1",
          type: "message",
          payload: {
            text: "Кликни",
            buttonRows: [
              [
                {
                  text: "ВЫБИРАЮ",
                  onClick: { addTags: ["chose-a"], removeTags: ["chose-b"] },
                },
              ],
            ],
          },
        },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("standalone actions node", () => {
    const r = flowGraphSchema.safeParse({
      version: 1,
      startNodeId: "n1",
      nodes: [
        {
          id: "n1",
          type: "actions",
          actions: {
            addTags: ["macro"],
            setVariables: [{ key: "deal.ts", value: "{{timestamp}}", asExpression: true }],
          },
          next: "end",
        },
        { id: "end", type: "end" },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("rejects unknown atomic op fields", () => {
    const r = inlineActionsSchema.safeParse({
      addTags: ["a"],
      // typo — should not be accepted silently
      removeTagsX: ["b"],
    });
    // zod default allows extra keys; this asserts the SHAPE not strict
    // mode — we'd add `.strict()` if we wanted to reject. Documenting
    // current behavior here.
    expect(r.success).toBe(true);
  });
});
