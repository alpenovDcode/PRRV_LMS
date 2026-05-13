// Evaluator for the flow expression DSL.
//
// The evaluator walks an AST produced by parser.ts and resolves
// identifiers via the EvalContext. There is no `eval` and no host
// function lookup except through the FUNCTIONS whitelist.
//
// Type coercion rules (kept close to SaleBot semantics):
//   - `+` over (number, number) is arithmetic; otherwise it's string
//     concat.
//   - `-`, `*`, `/`, `%`, `**`, `^` always coerce to number.
//   - `-` over two dd.mm.yyyy strings returns DAYS between them.
//   - `-` over two HH:MM strings returns MINUTES between them.
//   - Comparing different runtime types returns `false` for `==`,
//     `true` for `!=`, and `false` for `<`, `<=`, `>`, `>=`.
//   - `and` / `or` short-circuit and return the deciding operand
//     (truthy-coerced) rather than always a bool — matches Python /
//     SaleBot intuition.

import type { Ast } from "./parser";
import { FUNCTIONS } from "./functions";

export interface EvalContext {
  // Read identifier `name` — used for top-level vars like `now`,
  // `client`, `project`, `question`, etc. Return undefined if not
  // found; the caller will treat that as "no such variable".
  resolve: (name: string) => unknown;
  // Optional: extra functions on top of the built-in registry.
  // Useful for engine-bound helpers like `get_var("client.x")` etc.
  // Not used in Iter 1 but provisioned here.
  extraFunctions?: Record<string, (...args: unknown[]) => unknown>;
}

export class EvalError extends Error {
  constructor(msg: string) {
    super(`evaluation error: ${msg}`);
  }
}

// dd.mm.yyyy → JS Date or null
const DATE_RE = /^\d{1,2}[.\-/]\d{1,2}[.\-/]\d{4}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/;
const TIME_RE = /^\d{1,2}:\d{2}(?::\d{2})?$/;

function isDateStr(s: unknown): s is string {
  return typeof s === "string" && DATE_RE.test(s.trim());
}
function isTimeStr(s: unknown): s is string {
  return typeof s === "string" && TIME_RE.test(s.trim());
}
function parseDateStr(s: string): Date | null {
  const m = /^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s.trim());
  if (!m) return null;
  return new Date(
    Number(m[3]),
    Number(m[2]) - 1,
    Number(m[1]),
    Number(m[4] ?? 0),
    Number(m[5] ?? 0),
    Number(m[6] ?? 0)
  );
}
function parseTimeMin(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function toNum(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v == null) return 0;
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : NaN;
}
function truthy(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0 && !Number.isNaN(v);
  if (typeof v === "string") return v.length > 0 && v !== "0" && v.toLowerCase() !== "false";
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v).length > 0;
  return Boolean(v);
}

function compare(left: unknown, right: unknown, op: string): boolean {
  // Date string × date string
  if (
    op !== "==" &&
    op !== "!=" &&
    isDateStr(left) &&
    isDateStr(right)
  ) {
    const a = parseDateStr(left as string)?.getTime();
    const b = parseDateStr(right as string)?.getTime();
    if (a == null || b == null) return false;
    return numCompare(a, b, op);
  }
  if (
    op !== "==" &&
    op !== "!=" &&
    isTimeStr(left) &&
    isTimeStr(right)
  ) {
    const a = parseTimeMin(left as string)!;
    const b = parseTimeMin(right as string)!;
    return numCompare(a, b, op);
  }
  // Number × number (or coercible)
  const ln = toNum(left);
  const rn = toNum(right);
  if (!Number.isNaN(ln) && !Number.isNaN(rn) && typeof left !== "string" && typeof right !== "string") {
    return numCompare(ln, rn, op);
  }
  // Equality on disparate types: compare as strings if both stringy.
  if (op === "==") {
    if (left == null && right == null) return true;
    if (left == null || right == null) return false;
    if (typeof left === typeof right) return left === right;
    return String(left) === String(right);
  }
  if (op === "!=") return !compare(left, right, "==");
  // Strings — lexicographic
  if (typeof left === "string" && typeof right === "string") {
    return numCompare(left as unknown as number, right as unknown as number, op);
  }
  // Last resort — coerce to number, NaN comparisons return false.
  if (Number.isNaN(ln) || Number.isNaN(rn)) return false;
  return numCompare(ln, rn, op);
}
function numCompare(a: number, b: number, op: string): boolean {
  switch (op) {
    case "<": return a < b;
    case "<=": return a <= b;
    case ">": return a > b;
    case ">=": return a >= b;
    case "==": return a === b;
    case "!=": return a !== b;
    default: return false;
  }
}

export function evaluate(node: Ast, ctx: EvalContext): unknown {
  switch (node.kind) {
    case "literal":
      return node.value;
    case "ident": {
      const v = ctx.resolve(node.name);
      return v;
    }
    case "member": {
      const obj = evaluate(node.object, ctx);
      if (obj == null) return undefined;
      if (typeof obj !== "object") return undefined;
      return (obj as Record<string, unknown>)[node.property];
    }
    case "index": {
      const obj = evaluate(node.object, ctx);
      const idx = evaluate(node.index, ctx);
      if (obj == null) return undefined;
      if (Array.isArray(obj)) {
        const i = Math.trunc(toNum(idx));
        if (i < 0) return obj[obj.length + i];
        return obj[i];
      }
      if (typeof obj === "object") return (obj as Record<string, unknown>)[String(idx)];
      return undefined;
    }
    case "array":
      return node.elements.map((el) => evaluate(el, ctx));
    case "unary": {
      const v = evaluate(node.operand, ctx);
      switch (node.op) {
        case "-": return -toNum(v);
        case "+": return toNum(v);
        case "not": return !truthy(v);
      }
      return undefined;
    }
    case "call": {
      // Only direct identifier calls are allowed. No `obj.method()`
      // dispatch — that would let users pivot from `vars` to host JS.
      if (node.callee.kind !== "ident") {
        throw new EvalError("only top-level functions can be called");
      }
      const name = node.callee.name;
      const fn =
        ctx.extraFunctions?.[name] ?? (FUNCTIONS as Record<string, (...args: unknown[]) => unknown>)[name];
      if (!fn) throw new EvalError(`unknown function '${name}'`);
      const args = node.args.map((a) => evaluate(a, ctx));
      try {
        return fn(...args);
      } catch (e) {
        throw new EvalError(`'${name}' failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    case "binary": {
      const op = node.op;
      // Short-circuit logical
      if (op === "and") {
        const l = evaluate(node.left, ctx);
        return truthy(l) ? evaluate(node.right, ctx) : l;
      }
      if (op === "or") {
        const l = evaluate(node.left, ctx);
        return truthy(l) ? l : evaluate(node.right, ctx);
      }
      const l = evaluate(node.left, ctx);
      const r = evaluate(node.right, ctx);
      switch (op) {
        case "+":
          if (typeof l === "number" && typeof r === "number") return l + r;
          // Date + days
          if (isDateStr(l) && typeof r === "number") {
            const dt = parseDateStr(l as string);
            if (!dt) return "";
            dt.setDate(dt.getDate() + Math.trunc(r));
            const pad = (n: number) => String(n).padStart(2, "0");
            return `${pad(dt.getDate())}.${pad(dt.getMonth() + 1)}.${dt.getFullYear()}`;
          }
          // Time + minutes
          if (isTimeStr(l) && typeof r === "number") {
            const tm = parseTimeMin(l as string)!;
            const total = tm + Math.trunc(r);
            const pad = (n: number) => String(n).padStart(2, "0");
            return `${pad(((Math.floor(total / 60) % 24) + 24) % 24)}:${pad(((total % 60) + 60) % 60)}`;
          }
          // String concat
          return String(l ?? "") + String(r ?? "");
        case "-":
          // Date - date = days
          if (isDateStr(l) && isDateStr(r)) {
            const a = parseDateStr(l as string)!.getTime();
            const b = parseDateStr(r as string)!.getTime();
            return Math.round((a - b) / 86_400_000);
          }
          // Time - time = minutes
          if (isTimeStr(l) && isTimeStr(r)) {
            return parseTimeMin(l as string)! - parseTimeMin(r as string)!;
          }
          // Date - number = date back
          if (isDateStr(l) && typeof r === "number") {
            const dt = parseDateStr(l as string)!;
            dt.setDate(dt.getDate() - Math.trunc(r));
            const pad = (n: number) => String(n).padStart(2, "0");
            return `${pad(dt.getDate())}.${pad(dt.getMonth() + 1)}.${dt.getFullYear()}`;
          }
          return toNum(l) - toNum(r);
        case "*": return toNum(l) * toNum(r);
        case "/": {
          const rn = toNum(r);
          if (rn === 0) return 0; // SaleBot returns 0 / silent; we do too
          return toNum(l) / rn;
        }
        case "%": {
          const rn = toNum(r);
          if (rn === 0) return 0;
          return toNum(l) % rn;
        }
        case "**":
        case "^":
          return Math.pow(toNum(l), toNum(r));
        case "==":
        case "!=":
        case "<":
        case "<=":
        case ">":
        case ">=":
          return compare(l, r, op);
      }
      throw new EvalError(`unknown operator '${op}'`);
    }
  }
}
