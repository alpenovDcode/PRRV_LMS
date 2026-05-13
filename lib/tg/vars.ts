// Template substitution for flow nodes. Supported placeholders:
//   {{vars.<key>}}      — TgSubscriber.variables[key]
//   {{user.first_name}} — subscriber columns: first_name|last_name|username|chat_id
//   {{bot.username}}    — bot columns
//   {{ctx.<key>}}       — TgFlowRun.context[key] (HTTP response, etc.)
//
// Unknown placeholders render as an empty string rather than the raw
// template — this keeps customer messages from leaking template syntax
// when a variable is missing.

export interface RenderContext {
  subscriber: {
    chatId: string;
    firstName?: string | null;
    lastName?: string | null;
    username?: string | null;
    variables: Record<string, unknown>;
  };
  bot: {
    username: string;
    title: string;
  };
  runContext: Record<string, unknown>;
}

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z][a-zA-Z0-9_.]*)\s*\}\}/g;

function getPath(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const seg of path) {
    if (cur === null || cur === undefined) return undefined;
    if (typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

export function renderTemplate(input: string, ctx: RenderContext): string {
  return input.replace(PLACEHOLDER_RE, (_match, key: string) => {
    const segs = key.split(".");
    const root = segs[0];
    const rest = segs.slice(1);

    if (root === "vars") {
      const v = getPath(ctx.subscriber.variables, rest);
      return v == null ? "" : String(v);
    }
    if (root === "user") {
      const map: Record<string, unknown> = {
        first_name: ctx.subscriber.firstName ?? "",
        last_name: ctx.subscriber.lastName ?? "",
        username: ctx.subscriber.username ?? "",
        chat_id: ctx.subscriber.chatId,
      };
      const v = map[rest[0] ?? ""];
      return v == null ? "" : String(v);
    }
    if (root === "bot") {
      const map: Record<string, unknown> = {
        username: ctx.bot.username,
        title: ctx.bot.title,
      };
      const v = map[rest[0] ?? ""];
      return v == null ? "" : String(v);
    }
    if (root === "ctx") {
      const v = getPath(ctx.runContext, rest);
      return v == null ? "" : String(v);
    }
    return "";
  });
}
