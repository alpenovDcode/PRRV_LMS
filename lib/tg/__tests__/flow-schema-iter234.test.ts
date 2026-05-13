// Iter 2-3 schema accepts the new shapes we depend on at runtime.

import { describe, it, expect } from "vitest";
import { flowGraphSchema, triggersSchema } from "../flow-schema";

describe("schema accepts Iter 2+3 additions", () => {
  it("message with media attachments", () => {
    const r = flowGraphSchema.safeParse({
      version: 1,
      startNodeId: "n1",
      nodes: [
        {
          id: "n1",
          type: "message",
          payload: {
            text: "Hello",
            attachments: [
              { kind: "photo", fileId: "AgACAg…", fileName: "p.jpg" },
              { kind: "video_note", fileId: "BQACAg…" },
            ],
            keyboardMode: "reply",
            oneTimeKeyboard: true,
            buttonRows: [[{ text: "📞 Поделиться телефоном", requestContact: true }]],
            disableNotification: true,
          },
          isPosition: true,
        },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("list ops + tag triggers", () => {
    const flow = flowGraphSchema.safeParse({
      version: 1,
      startNodeId: "n1",
      nodes: [
        { id: "n1", type: "add_to_list", listId: "list-vip", next: "n2" },
        { id: "n2", type: "remove_from_list", listId: "list-cold" },
      ],
    });
    expect(flow.success).toBe(true);
    const t = triggersSchema.safeParse([
      { type: "tag_added", tag: "vip" },
      { type: "tag_removed", tag: "cold" },
      { type: "list_joined", listId: "list-1" },
      { type: "list_left", listId: "list-2" },
    ]);
    expect(t.success).toBe(true);
  });

  it("wait_reply with validation and field.x saveAs", () => {
    const r = flowGraphSchema.safeParse({
      version: 1,
      startNodeId: "n1",
      nodes: [
        {
          id: "n1",
          type: "wait_reply",
          saveAs: "field.email",
          timeoutSeconds: 3600,
          validation: {
            pattern: "^[^@]+@.+\\.[a-z]+$",
            errorMessage: "Введите email",
            maxAttempts: 3,
          },
        },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("condition with expr rule + numeric ops", () => {
    const r = flowGraphSchema.safeParse({
      version: 1,
      startNodeId: "n1",
      nodes: [
        {
          id: "n1",
          type: "condition",
          rules: [
            {
              kind: "variable",
              params: { key: "client.age", op: "gte", value: "18" },
              next: "adult",
            },
            { kind: "expr", params: { expr: "in_list('vip')" }, next: "vip" },
            { kind: "always", params: {}, next: "default" },
          ],
        },
        { id: "adult", type: "end" },
        { id: "vip", type: "end" },
        { id: "default", type: "end" },
      ],
    });
    expect(r.success).toBe(true);
  });
});
