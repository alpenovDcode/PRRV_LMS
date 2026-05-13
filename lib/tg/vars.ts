// Variable resolution + template rendering for the flow engine.
//
// We support four scopes (matching SaleBot's mental model):
//   client.x   — TgSubscriber.variables[x]  (also `vars.x` for back-compat)
//   project.x  — TgBot.projectVariables[x]
//   deal.x     — TgFlowRun.context[x]   (per-run scratch; like SaleBot deal vars)
//   const.x    — TgBot.constants[x]
//
// Plus ~20 built-in identifiers that resolve directly without scope:
//   platform_id        chat_id of the subscriber (SaleBot alias)
//   client_id          subscriber.id
//   question           last incoming message text
//   name               subscriber.firstName
//   full_name          firstName + lastName
//   first_name / last_name / username / language_code
//   messenger          "Telegram" (constant for now; broaden in Iter 4)
//   client_type        1 (numeric Telegram code, SaleBot semantics)
//   current_date       today as dd.mm.yyyy
//   current_time       now as HH:MM
//   next_day           tomorrow as dd.mm.yyyy
//   weekday            1=Mon … 7=Sun
//   date_of_creation   subscriber.subscribedAt as dd.mm.yyyy
//   time_of_creation   subscriber.subscribedAt as HH:MM
//   timestamp          ms since epoch
//   message_id         current flow node id
//   none / None        the empty sentinel — matches `#{none}` semantics
//   now / today        current Date in dd.mm.yyyy form
//
// All scopes and built-ins are exposed through a single EvalContext
// so template authors can use them anywhere a `{{expr}}` is supported
// (message text, set_variable, http_request URL/body/headers, etc.).

import type { TgBot, TgSubscriber, TgFlowRun } from "@prisma/client";
import {
  evalCondition,
  evalExpression,
  renderTemplate as renderExprTemplate,
  type EvalContext,
} from "./expr";

// -- low-level snapshots --------------------------------------------

// Minimal snapshot of a subscriber that the engine passes around. We
// don't pass the whole TgSubscriber record to keep this file unit-
// testable without a live Prisma connection.
export interface SubscriberSnapshot {
  id: string;
  chatId: string;
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  languageCode?: string | null;
  tags: string[];
  variables: Record<string, unknown>;
  customFields: Record<string, unknown>;
  subscribedAt: Date;
  lastSeenAt?: Date | null;
  currentPositionNodeId?: string | null;
  currentPositionFlowId?: string | null;
}
export interface BotSnapshot {
  id: string;
  username: string;
  title: string;
  projectVariables: Record<string, unknown>;
  constants: Record<string, unknown>;
  timezone: string | null;
}
export interface RunSnapshot {
  id: string;
  flowId: string;
  currentNodeId?: string | null;
  context: Record<string, unknown>;
}

export function snapSubscriber(s: TgSubscriber): SubscriberSnapshot {
  return {
    id: s.id,
    chatId: s.chatId,
    firstName: s.firstName,
    lastName: s.lastName,
    username: s.username,
    languageCode: s.languageCode,
    tags: s.tags,
    variables: (s.variables as Record<string, unknown>) ?? {},
    customFields: (s.customFields as Record<string, unknown>) ?? {},
    subscribedAt: s.subscribedAt,
    lastSeenAt: s.lastSeenAt,
    currentPositionNodeId: s.currentPositionNodeId,
    currentPositionFlowId: s.currentPositionFlowId,
  };
}
export function snapBot(b: TgBot): BotSnapshot {
  return {
    id: b.id,
    username: b.username,
    title: b.title,
    projectVariables: (b.projectVariables as Record<string, unknown>) ?? {},
    constants: (b.constants as Record<string, unknown>) ?? {},
    timezone: b.timezone,
  };
}
export function snapRun(r: TgFlowRun): RunSnapshot {
  return {
    id: r.id,
    flowId: r.flowId,
    currentNodeId: r.currentNodeId,
    context: (r.context as Record<string, unknown>) ?? {},
  };
}

// -- date helpers (subscribers' tz from bot) ------------------------

// Format a Date in the bot's timezone as dd.mm.yyyy.
// Implementation note: Node 20+ ships Intl with full tz support, so we
// can avoid pulling in date-fns-tz for one feature.
function formatDateInTz(d: Date, tz: string | null): string {
  if (!tz) tz = "UTC";
  // en-GB gives dd/mm/yyyy which we then dot-ify.
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
  return parts.replace(/\//g, ".");
}
function formatTimeInTz(d: Date, tz: string | null): string {
  if (!tz) tz = "UTC";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}
function weekdayInTz(d: Date, tz: string | null): number {
  if (!tz) tz = "UTC";
  // SaleBot semantics: 1=Mon … 7=Sun
  const longName = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "long",
  }).format(d);
  const map: Record<string, number> = {
    Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6, Sunday: 7,
  };
  return map[longName] ?? 1;
}

// -- context construction -------------------------------------------

export interface BuildCtxArgs {
  subscriber: SubscriberSnapshot;
  bot: BotSnapshot;
  run?: RunSnapshot;
  // The inbound text that triggered the current flow tick, when known.
  // Surfaces as `{{question}}`. Engines that resume a flow on a timer
  // pass undefined here — `{{question}}` then resolves to "".
  inboundText?: string | null;
  // List IDs the subscriber currently belongs to. Used by the
  // `in_list("listId")` expression helper (Iter 2b).
  listMembershipIds?: string[];
}

export function buildEvalContext(args: BuildCtxArgs): EvalContext {
  const { subscriber, bot, run, inboundText, listMembershipIds = [] } = args;
  const now = new Date();
  const tz = bot.timezone;

  // Scope objects exposed as identifiers — `client`, `project`, `deal`, `const`.
  // We freeze them so user expressions can't mutate the maps in place.
  const clientScope = Object.freeze({ ...subscriber.variables, ...subscriber.customFields });
  const projectScope = Object.freeze({ ...bot.projectVariables });
  const dealScope = Object.freeze({ ...(run?.context ?? {}) });
  const constScope = Object.freeze({ ...bot.constants });

  // Built-in identifiers — flat map. Order matters when a user picks
  // a name that collides with a scope; we resolve scopes first below.
  const builtins: Record<string, unknown> = {
    platform_id: subscriber.chatId,
    chat_id: subscriber.chatId,
    client_id: subscriber.id,
    question: inboundText ?? "",
    name: subscriber.firstName ?? "",
    first_name: subscriber.firstName ?? "",
    last_name: subscriber.lastName ?? "",
    full_name: [subscriber.firstName, subscriber.lastName].filter(Boolean).join(" "),
    username: subscriber.username ?? "",
    language_code: subscriber.languageCode ?? "",
    messenger: "Telegram",
    client_type: 1,
    timezone: tz ?? "UTC",
    current_date: formatDateInTz(now, tz),
    current_time: formatTimeInTz(now, tz),
    next_day: formatDateInTz(new Date(now.getTime() + 86_400_000), tz),
    weekday: weekdayInTz(now, tz),
    date_of_creation: formatDateInTz(subscriber.subscribedAt, tz),
    time_of_creation: formatTimeInTz(subscriber.subscribedAt, tz),
    timestamp: now.getTime(),
    message_id: run?.currentNodeId ?? null,
    none: "",
    None: "",
    null: null,
    // SaleBot's `now()` is the calculator's "current_time" — we also
    // expose `today` for date arithmetic ergonomics.
    now: formatDateInTz(now, tz),
    today: formatDateInTz(now, tz),
    // Subscriber tags as an array — for `in_array(tags, 'vip')` style.
    tags: subscriber.tags,
  };

  const listSet = new Set(listMembershipIds);

  return {
    extraFunctions: {
      // `in_list(listId)` — true if subscriber is in that list right now.
      in_list: (...args: unknown[]) => {
        const id = args[0];
        return id != null && listSet.has(String(id));
      },
      // `list_size(listId)` — synchronous lookup not possible; return 0
      // and rely on the broadcast targeting / lists API for real counts.
      // We expose the function name so authors don't get an "unknown
      // function" error mid-flow.
      list_size: () => 0,
    },
    resolve(name: string) {
      if (name === "client") return clientScope;
      if (name === "project") return projectScope;
      if (name === "deal") return dealScope;
      if (name === "const") return constScope;
      if (name === "lists") return Array.from(listSet);
      // SaleBot's legacy `vars.x` alias for client.x.
      if (name === "vars") return clientScope;
      if (name === "user") {
        return {
          first_name: subscriber.firstName ?? "",
          last_name: subscriber.lastName ?? "",
          username: subscriber.username ?? "",
          chat_id: subscriber.chatId,
          id: subscriber.id,
        };
      }
      if (name === "bot") {
        return { username: bot.username, title: bot.title, id: bot.id };
      }
      if (name === "ctx") return dealScope;
      if (name === "subscriber") {
        return {
          id: subscriber.id,
          first_name: subscriber.firstName ?? "",
          last_name: subscriber.lastName ?? "",
          username: subscriber.username ?? "",
          tags: subscriber.tags,
          variables: clientScope,
        };
      }
      if (name in builtins) return builtins[name];
      // Unknown name → undefined (renders as "" in templates).
      return undefined;
    },
  };
}

// -- public templating API ------------------------------------------

// Backwards-compatible alias kept so existing engine code that imported
// `RenderContext` still type-checks. New callers should construct an
// EvalContext via buildEvalContext and pass that directly.
export type RenderContext = EvalContext;

export function renderTemplate(text: string, ctx: EvalContext): string {
  return renderExprTemplate(text, ctx);
}

export function evalConditionExpr(expr: string, ctx: EvalContext): boolean {
  return evalCondition(expr, ctx);
}

export function evalValueExpr(expr: string, ctx: EvalContext): unknown {
  return evalExpression(expr, ctx);
}
