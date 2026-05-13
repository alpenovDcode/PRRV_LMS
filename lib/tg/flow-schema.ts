// Flow graph contract. The graph is stored as JSON in tg_flows.graph
// and parsed at execution time. Keeping the contract here (rather than
// inlined in the engine) makes it easy to validate and to render in UI.

import { z } from "zod";

// ---------- Message payload (used by message-node and broadcasts) ----------

export const buttonSchema = z.object({
  text: z.string().min(1).max(64),
  // Mutually exclusive: url OR callback. We keep both optional and rely
  // on the engine to pick the first non-empty.
  url: z.string().url().optional(),
  callback: z.string().max(64).optional(),
  // Optional: which node to jump to when this button is clicked.
  goto: z.string().optional(),
  // Optional: tag to apply / remove when clicked (handy for tag-based flows).
  addTag: z.string().optional(),
  removeTag: z.string().optional(),
});
export type FlowButton = z.infer<typeof buttonSchema>;

export const messagePayloadSchema = z.object({
  // Body text with HTML formatting (sanitized by the engine before send).
  text: z.string().min(1).max(4096),
  // Optional media URL — must be publicly reachable by Telegram.
  photoUrl: z.string().url().optional(),
  // Buttons are arranged in rows.
  buttonRows: z.array(z.array(buttonSchema)).optional(),
  // Parse mode override (defaults to HTML).
  parseMode: z.enum(["HTML", "MarkdownV2"]).optional(),
  // Disable web preview override.
  disablePreview: z.boolean().optional(),
});
export type FlowMessagePayload = z.infer<typeof messagePayloadSchema>;

// ---------- Nodes ----------

const baseNode = z.object({
  id: z.string().min(1),
  // Optional human label for editors.
  label: z.string().optional(),
  // Next node by default — overridden per-node-type for branching nodes.
  next: z.string().optional(),
});

export const messageNodeSchema = baseNode.extend({
  type: z.literal("message"),
  payload: messagePayloadSchema,
});

export const delayNodeSchema = baseNode.extend({
  type: z.literal("delay"),
  // Duration in seconds. Capped to 30 days by the engine to keep
  // tg_flow_runs from holding state forever.
  seconds: z.number().int().positive().max(60 * 60 * 24 * 30),
});

export const waitReplyNodeSchema = baseNode.extend({
  type: z.literal("wait_reply"),
  // Variable name to store the captured text into.
  saveAs: z.string().min(1).max(64),
  // Timeout in seconds. If user doesn't reply in time, follow `timeoutNext`.
  timeoutSeconds: z.number().int().positive().max(60 * 60 * 24 * 7),
  timeoutNext: z.string().optional(),
});

export const conditionNodeSchema = baseNode.extend({
  type: z.literal("condition"),
  // Each rule is checked in order; first match wins.
  rules: z
    .array(
      z.object({
        // 'tag' | 'variable' | 'always'
        kind: z.enum(["tag", "variable", "always"]),
        // For kind=tag: { op: 'has'|'not_has', value: string }
        // For kind=variable: { key: string, op: 'eq'|'ne'|'contains'|'exists'|'not_exists', value?: string }
        params: z.record(z.string(), z.unknown()),
        next: z.string(),
      })
    )
    .min(1),
  // Fallback if nothing matched (otherwise the run ends).
  defaultNext: z.string().optional(),
});

export const tagOpNodeSchema = baseNode.extend({
  type: z.enum(["add_tag", "remove_tag"]),
  tag: z.string().min(1).max(64),
});

export const setVariableNodeSchema = baseNode.extend({
  type: z.literal("set_variable"),
  key: z.string().min(1).max(64),
  // Value may reference {{vars.X}} or {{user.first_name}} — see vars.ts.
  value: z.string().max(2048),
});

export const httpRequestNodeSchema = baseNode.extend({
  type: z.literal("http_request"),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  url: z.string().url(),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.string().optional(),
  // Save the JSON response into vars under this key.
  saveAs: z.string().optional(),
  // 'next' is used on success; 'onError' on transport/HTTP failure.
  onError: z.string().optional(),
});

export const gotoFlowNodeSchema = baseNode.extend({
  type: z.literal("goto_flow"),
  flowId: z.string().min(1),
});

export const endNodeSchema = baseNode.extend({
  type: z.literal("end"),
});

export const flowNodeSchema = z.discriminatedUnion("type", [
  messageNodeSchema,
  delayNodeSchema,
  waitReplyNodeSchema,
  conditionNodeSchema,
  tagOpNodeSchema,
  setVariableNodeSchema,
  httpRequestNodeSchema,
  gotoFlowNodeSchema,
  endNodeSchema,
]);
export type FlowNode = z.infer<typeof flowNodeSchema>;

export const flowGraphSchema = z.object({
  version: z.literal(1),
  startNodeId: z.string().min(1),
  nodes: z.array(flowNodeSchema).min(1),
});
export type FlowGraph = z.infer<typeof flowGraphSchema>;

// ---------- Triggers ----------

export const triggerSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("command"),
    // e.g. "start", "help" — without leading slash.
    command: z.string().min(1).max(32),
    // Optional: only fire if the /start payload matches one of these.
    payloads: z.array(z.string()).optional(),
  }),
  z.object({
    type: z.literal("keyword"),
    // Case-insensitive substring match against incoming text.
    keywords: z.array(z.string().min(1)).min(1),
  }),
  z.object({
    type: z.literal("regex"),
    // ECMAScript regex, case-insensitive. Tested against the message text.
    pattern: z.string().min(1).max(256),
  }),
  z.object({
    type: z.literal("subscribed"),
    // Fired when a new TgSubscriber is created (first /start, etc.).
  }),
]);
export type FlowTrigger = z.infer<typeof triggerSchema>;

export const triggersSchema = z.array(triggerSchema);
