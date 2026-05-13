// Public API for the flow expression engine.
//
// Usage:
//   const ctx = buildEvalContext({ subscriber, bot, run });
//   const text = renderTemplate("Здравствуй, {{name}}! Сегодня {{current_date_rus()}}.", ctx);
//   const ok = evalCondition("age >= 18 and country == 'RU'", ctx);

import { parseExpr, type Ast } from "./parser";
import { evaluate, type EvalContext } from "./evaluator";

export { FUNCTIONS, FUNCTION_SIGNATURES } from "./functions";
export type { EvalContext } from "./evaluator";

// Substitute `{{expr}}` placeholders inside `template`. Each placeholder
// body is a full expression — `{{name}}`, `{{addDays(now, 3)}}`,
// `{{name + " " + last_name}}`. On evaluation failure, the placeholder
// renders as an empty string (so a buggy template never leaks raw
// `{{...}}` into a user-facing message). Errors are returned via the
// optional `onError` callback for editor live-preview.
export function renderTemplate(
  template: string,
  ctx: EvalContext,
  onError?: (err: Error, expr: string) => void
): string {
  let out = "";
  let i = 0;
  const n = template.length;
  while (i < n) {
    // SaleBot uses `#{...}` too, but I'm standardizing on `{{...}}`
    // to avoid HTML-injection confusion (`<#{...}>` etc.). Both forms
    // are recognised by the parser for migration friendliness.
    const startA = template.indexOf("{{", i);
    const startB = template.indexOf("#{", i);
    let start = -1;
    let opener = "";
    if (startA >= 0 && (startB < 0 || startA <= startB)) {
      start = startA;
      opener = "{{";
    } else if (startB >= 0) {
      start = startB;
      opener = "#{";
    }
    if (start < 0) {
      out += template.slice(i);
      break;
    }
    out += template.slice(i, start);
    const closer = opener === "{{" ? "}}" : "}";
    const end = template.indexOf(closer, start + opener.length);
    if (end < 0) {
      // Unterminated — bail and treat the rest as literal.
      out += template.slice(start);
      break;
    }
    const expr = template.slice(start + opener.length, end).trim();
    if (expr) {
      try {
        const ast = parseExpr(expr);
        const v = evaluate(ast, ctx);
        out += v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        if (onError) onError(err, expr);
        // Render nothing — keeps prod messages clean.
      }
    }
    i = end + closer.length;
  }
  return out;
}

// Evaluate `expr` as a boolean condition. Wraps the underlying
// evaluator's truthy semantics. On parse/eval error, returns `false`
// (so a broken condition fails-closed rather than fails-open).
export function evalCondition(
  expr: string,
  ctx: EvalContext,
  onError?: (err: Error) => void
): boolean {
  try {
    const ast = parseExpr(expr);
    const v = evaluate(ast, ctx);
    return toBool(v);
  } catch (e) {
    if (onError) onError(e instanceof Error ? e : new Error(String(e)));
    return false;
  }
}

// Evaluate `expr` and return the raw value. Used by `set_variable`.
export function evalExpression(
  expr: string,
  ctx: EvalContext
): unknown {
  const ast = parseExpr(expr);
  return evaluate(ast, ctx);
}

// Parse and cache an AST — useful in flow-engine when the same
// expression runs once per tick across many subscribers (broadcasts).
export function parseExpression(expr: string): Ast {
  return parseExpr(expr);
}

function toBool(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0 && !Number.isNaN(v);
  if (typeof v === "string") return v.length > 0 && v !== "0" && v.toLowerCase() !== "false";
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v).length > 0;
  return Boolean(v);
}
