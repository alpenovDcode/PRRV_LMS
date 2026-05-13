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
  // Iter 1: request_contact / request_location are deferred to Iter 3.
  // We accept the field shape so saved flows that experiment with it
  // don't get rejected by zod, but the engine ignores them for now.
  requestContact: z.boolean().optional(),
  requestLocation: z.boolean().optional(),
});
export type FlowButton = z.infer<typeof buttonSchema>;

// ---------- Media attachments ----------------------------------------
// A single attachment can be one of seven Telegram media kinds. Each
// stores either a `fileId` (preferred — cached, reusable, no upload
// cost) or a public `url` (fallback for stock images and one-offs).
// Captions live on the parent payload, not per-attachment, to match
// Telegram's API (only the FIRST item in an album carries a caption).
export const mediaAttachmentSchema = z.object({
  kind: z.enum([
    "photo",
    "video",
    "voice",
    "video_note",
    "document",
    "audio",
    "animation",
  ]),
  // Exactly one of these is required at runtime. Schema-level we allow
  // both as optional so partially-edited drafts validate.
  fileId: z.string().min(1).max(256).optional(),
  url: z.string().url().optional(),
  // Optional metadata captured at /fileid time — only used by the UI
  // for preview/tooltips. Engine sends just fileId or url.
  fileName: z.string().max(256).optional(),
  mimeType: z.string().max(64).optional(),
  duration: z.number().int().nonnegative().optional(),
});
export type MediaAttachment = z.infer<typeof mediaAttachmentSchema>;

export const messagePayloadSchema = z.object({
  // Body text with HTML formatting (sanitized by the engine before send).
  // Supports {{expr}} templates resolved against subscriber + bot + run.
  // Required for text-only messages; optional when sending an album where
  // a caption suffices. We keep it min(1) to discourage empty sends and
  // let the editor pre-fill it when an attachment is added.
  text: z.string().min(1).max(4096),
  // Legacy single-photo URL kept for backwards compatibility with flows
  // saved before Iter 2. New flows use `attachments` instead. If both
  // are present, `attachments` wins.
  photoUrl: z.string().url().optional(),
  // 0..10 media attachments. Multiple = sent as a media group / album
  // (only "photo" and "video" can be mixed in an album per Telegram's
  // rules; the sender enforces this).
  attachments: z.array(mediaAttachmentSchema).max(10).optional(),
  // Buttons are arranged in rows.
  buttonRows: z.array(z.array(buttonSchema)).optional(),
  // Parse mode override (defaults to HTML).
  parseMode: z.enum(["HTML", "MarkdownV2"]).optional(),
  // Disable web preview override.
  disablePreview: z.boolean().optional(),
  // Suppress notification sound. Useful for low-priority side-effect
  // messages so we don't ping every subscriber at 3am.
  disableNotification: z.boolean().optional(),
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
  // True = this is a "position" / "Step" in SaleBot's terminology.
  // When the subscriber walks into this node, their currentPosition
  // pointer is updated and sleeping side-effect runs from previous
  // positions get auto-cancelled.
  // Defaults to TRUE so first-time flow builders get sensible
  // dozhim-cancellation semantics. Set to false for purely
  // informational side-effects (e.g. parallel logs).
  isPosition: z.boolean().optional(),
});

// SaleBot supports five duration units. We keep an internal seconds
// field as the source of truth so the engine doesn't care about unit
// arithmetic; `displayUnit` is purely a UI hint for editor rendering.
export const delayNodeSchema = baseNode.extend({
  type: z.literal("delay"),
  // Duration in seconds. Capped to 90 days to keep tg_flow_runs from
  // holding state forever (extended from 30d in Iter 1 to support
  // monthly cohorts in onboarding funnels).
  seconds: z.number().int().positive().max(60 * 60 * 24 * 90),
  displayUnit: z.enum(["seconds", "minutes", "hours", "days", "weeks", "months"]).optional(),
});

// Regex validation for wait_reply input. If `pattern` is set, the
// captured text must match before the run advances; otherwise the
// run jumps to `onInvalidNext` (and re-prompts if that's null).
export const waitReplyValidationSchema = z.object({
  // ECMAScript regex source (without flags). Case-insensitive by default.
  pattern: z.string().min(1).max(512),
  // Optional flags string (e.g. "i", "s", "u"). Defaults to "i".
  flags: z.string().max(8).optional(),
  // Human-readable error sent to the user when validation fails.
  // Supports {{expr}} templates. If empty, no error message is sent
  // and the run re-prompts implicitly via onInvalidNext.
  errorMessage: z.string().max(2048).optional(),
  // Node to jump to on invalid input. If null/empty, the run stays at
  // the wait_reply node (effectively re-prompting on next reply).
  onInvalidNext: z.string().optional(),
  // Max retries before giving up and following timeoutNext. Helps
  // avoid infinite re-prompt loops if the user keeps typing garbage.
  maxAttempts: z.number().int().positive().max(10).optional(),
}).optional();

export const waitReplyNodeSchema = baseNode.extend({
  type: z.literal("wait_reply"),
  // Variable name to store the captured text into. Prefix with
  // `client.` (default), `project.` or `field.` to control scope.
  // `field.x` writes to TgSubscriber.customFields[x].
  saveAs: z.string().min(1).max(80),
  // Timeout in seconds. If user doesn't reply in time, follow `timeoutNext`.
  timeoutSeconds: z.number().int().positive().max(60 * 60 * 24 * 30),
  timeoutNext: z.string().optional(),
  validation: waitReplyValidationSchema,
});

// Condition rule. Iter 1 broadens ops to cover numeric and existence
// checks SaleBot supports.
export const conditionRuleSchema = z.object({
  kind: z.enum(["tag", "variable", "expr", "always"]),
  // kind=tag:      { op: 'has'|'not_has', value: string }
  // kind=variable: { key: string, op: 'eq'|'ne'|'contains'|'gt'|'gte'|'lt'|'lte'|'exists'|'not_exists', value?: any }
  // kind=expr:     { expr: string }   — full expression engine, evaluated as bool
  // kind=always:   {}
  params: z.record(z.string(), z.unknown()),
  next: z.string(),
});

export const conditionNodeSchema = baseNode.extend({
  type: z.literal("condition"),
  rules: z.array(conditionRuleSchema).min(1),
  defaultNext: z.string().optional(),
});

export const tagOpNodeSchema = baseNode.extend({
  type: z.enum(["add_tag", "remove_tag"]),
  tag: z.string().min(1).max(64),
});

export const setVariableNodeSchema = baseNode.extend({
  type: z.literal("set_variable"),
  // Variable key. Scope prefix optional:
  //   client.x   → TgSubscriber.variables[x]   (default)
  //   project.x  → TgBot.projectVariables[x]
  //   deal.x     → TgFlowRun.context[x]
  //   field.x    → TgSubscriber.customFields[x] (typed in Iter 2)
  key: z.string().min(1).max(80),
  // Value: a template ({{expr}} resolved) or a full expression.
  // If `asExpression` is true, the whole string is evaluated as an
  // expression and the raw result (number, bool, array) is stored.
  // Otherwise it's rendered as a string template.
  value: z.string().max(4096),
  asExpression: z.boolean().optional(),
});

export const httpRequestNodeSchema = baseNode.extend({
  type: z.literal("http_request"),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  url: z.string().url(),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.string().optional(),
  // Save the JSON response into deal-scope context under this key.
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

// Free-form note / comment node. Skipped at execution time — when the
// engine encounters one, it just follows `next` without side-effects.
export const noteNodeSchema = baseNode.extend({
  type: z.literal("note"),
  text: z.string().max(4096).optional(),
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
  noteNodeSchema,
]);
export type FlowNode = z.infer<typeof flowNodeSchema>;

export const flowGraphSchema = z.object({
  version: z.literal(1),
  startNodeId: z.string().min(1),
  nodes: z.array(flowNodeSchema).min(1),
});
export type FlowGraph = z.infer<typeof flowGraphSchema>;

// ---------- Triggers ----------

// Shared advanced settings for any flow trigger. We expose these as a
// flat object on each trigger so the editor UI can render a single
// "Advanced" panel per trigger without juggling per-type config.
const advancedTriggerSchema = z.object({
  // Higher fires first when multiple triggers match. Default 10.
  priority: z.number().int().min(-1000).max(1000).optional(),
  // Fire at most once per subscriber. Skipped if subscriber has
  // already passed this `flowId:nodeId` (tracked via firedOnceTriggers).
  onlyOnce: z.boolean().optional(),
  // Match only when the inbound update is a button callback, not a
  // raw text message. Useful for confirmation flows.
  onlyOnCallback: z.boolean().optional(),
  // Strings to exclude — even if they would otherwise match the keyword
  // or regex, the trigger is suppressed. Helps prevent over-broad matchers.
  exclusions: z.array(z.string().min(1)).optional(),
}).partial();

export const triggerSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("command"),
    command: z.string().min(1).max(32),
    payloads: z.array(z.string()).optional(),
    advanced: advancedTriggerSchema.optional(),
  }),
  z.object({
    type: z.literal("keyword"),
    keywords: z.array(z.string().min(1)).min(1),
    // SaleBot's "Выбор соответствия": fuzzy / keyword / exact / regex.
    matchMode: z.enum(["fuzzy", "keyword", "exact", "regex"]).optional(),
    advanced: advancedTriggerSchema.optional(),
  }),
  z.object({
    type: z.literal("regex"),
    pattern: z.string().min(1).max(512),
    flags: z.string().max(8).optional(),
    advanced: advancedTriggerSchema.optional(),
  }),
  z.object({
    type: z.literal("subscribed"),
    advanced: advancedTriggerSchema.optional(),
  }),
  // Reactive triggers added in Iter 1 — fire on tag/list mutations.
  // Engine wiring lands in Iter 2 alongside the lists feature; for now
  // the schema accepts them so flows can be authored ahead.
  z.object({
    type: z.literal("tag_added"),
    tag: z.string().min(1).max(64),
    advanced: advancedTriggerSchema.optional(),
  }),
  z.object({
    type: z.literal("tag_removed"),
    tag: z.string().min(1).max(64),
    advanced: advancedTriggerSchema.optional(),
  }),
]);
export type FlowTrigger = z.infer<typeof triggerSchema>;

export const triggersSchema = z.array(triggerSchema);

// ---------- Helpers ----------

// Returns the trigger's advanced settings or defaults.
export function triggerAdvanced(t: FlowTrigger) {
  const a = "advanced" in t ? t.advanced ?? {} : {};
  return {
    priority: a.priority ?? 10,
    onlyOnce: a.onlyOnce ?? false,
    onlyOnCallback: a.onlyOnCallback ?? false,
    exclusions: a.exclusions ?? [],
  };
}

// True if a node should update the subscriber's currentPosition when
// entered. Used by the engine to decide whether to auto-cancel
// previous-position runs.
export function isPositionalNode(node: FlowNode): boolean {
  if (node.type !== "message") return false;
  // Default true — most messages ARE positions. Users can opt out for
  // side-effect-style messages (logs, admin pings) by setting false.
  return node.isPosition !== false;
}
