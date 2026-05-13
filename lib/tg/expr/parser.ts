// Pratt parser for the flow expression DSL.
//
// Operator precedence (low → high), matching JS / Python intuition:
//   1.  or
//   2.  and
//   3.  not   (prefix)
//   4.  == != < <= > >=
//   5.  + -
//   6.  * / %
//   7.  ** ^  (right-assoc)
//   8.  unary - +
//   9.  member access (a.b, a[i]) and function call (a(...))
//
// AST nodes are plain JSON-style objects so they can be cached or
// snapshotted to the run context for debugging.

import { tokenize, type Token } from "./tokenizer";

export type Ast =
  | { kind: "literal"; value: number | string | boolean | null }
  | { kind: "ident"; name: string }
  | { kind: "member"; object: Ast; property: string; computed: boolean }
  | { kind: "index"; object: Ast; index: Ast }
  | { kind: "call"; callee: Ast; args: Ast[] }
  | { kind: "array"; elements: Ast[] }
  | { kind: "unary"; op: "-" | "+" | "not"; operand: Ast }
  | { kind: "binary"; op: string; left: Ast; right: Ast };

export class ParseError extends Error {
  constructor(message: string, public pos: number) {
    super(`${message} at position ${pos}`);
  }
}

// Precedence table for binary operators. Higher binds tighter.
const PRECEDENCE: Record<string, number> = {
  or: 1,
  and: 2,
  "==": 4,
  "!=": 4,
  "<": 4,
  "<=": 4,
  ">": 4,
  ">=": 4,
  "+": 5,
  "-": 5,
  "*": 6,
  "/": 6,
  "%": 6,
  "**": 7,
  "^": 7,
};

const RIGHT_ASSOC = new Set(["**", "^"]);

export class Parser {
  private toks: Token[];
  private i = 0;

  constructor(src: string) {
    this.toks = tokenize(src);
  }

  // Parse the whole input as one expression. Throws if extra tokens
  // are left over.
  parse(): Ast {
    const e = this.parseExpression(0);
    if (this.peek().type !== "eof") {
      throw new ParseError(`Unexpected token '${this.peek().value}'`, this.peek().pos);
    }
    return e;
  }

  private peek(): Token {
    return this.toks[this.i];
  }
  private advance(): Token {
    return this.toks[this.i++];
  }
  private match(type: Token["type"], value?: string): boolean {
    const t = this.peek();
    if (t.type !== type) return false;
    if (value !== undefined && t.value !== value) return false;
    this.i++;
    return true;
  }
  private expect(type: Token["type"], value?: string): Token {
    const t = this.peek();
    if (t.type !== type || (value !== undefined && t.value !== value)) {
      throw new ParseError(
        `Expected ${value ?? type}, got '${t.value}' (${t.type})`,
        t.pos
      );
    }
    return this.advance();
  }

  // -- expression dispatch (Pratt) -----------------------------------

  private parseExpression(minPrec: number): Ast {
    let left = this.parseUnary();
    while (true) {
      const t = this.peek();
      let opName: string | null = null;
      if (t.type === "op") opName = t.value;
      else if (t.type === "word_op" && (t.value === "and" || t.value === "or"))
        opName = t.value;
      else break;

      const prec = PRECEDENCE[opName];
      if (prec === undefined || prec < minPrec) break;

      this.advance();
      const nextMin = RIGHT_ASSOC.has(opName) ? prec : prec + 1;
      const right = this.parseExpression(nextMin);
      left = { kind: "binary", op: opName, left, right };
    }
    return left;
  }

  private parseUnary(): Ast {
    const t = this.peek();
    if (t.type === "op" && (t.value === "-" || t.value === "+")) {
      this.advance();
      const operand = this.parseUnary();
      return { kind: "unary", op: t.value as "-" | "+", operand };
    }
    if (t.type === "word_op" && t.value === "not") {
      this.advance();
      const operand = this.parseUnary();
      return { kind: "unary", op: "not", operand };
    }
    return this.parsePostfix();
  }

  private parsePostfix(): Ast {
    let node = this.parsePrimary();
    while (true) {
      const t = this.peek();
      if (t.type === "dot") {
        this.advance();
        const prop = this.expect("ident");
        node = { kind: "member", object: node, property: prop.value, computed: false };
        continue;
      }
      if (t.type === "lbracket") {
        this.advance();
        const idx = this.parseExpression(0);
        this.expect("rbracket");
        node = { kind: "index", object: node, index: idx };
        continue;
      }
      if (t.type === "lparen") {
        this.advance();
        const args: Ast[] = [];
        if (this.peek().type !== "rparen") {
          args.push(this.parseExpression(0));
          while (this.match("comma")) args.push(this.parseExpression(0));
        }
        this.expect("rparen");
        node = { kind: "call", callee: node, args };
        continue;
      }
      break;
    }
    return node;
  }

  private parsePrimary(): Ast {
    const t = this.peek();
    if (t.type === "number") {
      this.advance();
      return { kind: "literal", value: parseFloat(t.value) };
    }
    if (t.type === "string") {
      this.advance();
      return { kind: "literal", value: t.value };
    }
    if (t.type === "true") {
      this.advance();
      return { kind: "literal", value: true };
    }
    if (t.type === "false") {
      this.advance();
      return { kind: "literal", value: false };
    }
    if (t.type === "null") {
      this.advance();
      return { kind: "literal", value: null };
    }
    if (t.type === "ident") {
      this.advance();
      return { kind: "ident", name: t.value };
    }
    if (t.type === "lparen") {
      this.advance();
      const e = this.parseExpression(0);
      this.expect("rparen");
      return e;
    }
    if (t.type === "lbracket") {
      this.advance();
      const elements: Ast[] = [];
      if (this.peek().type !== "rbracket") {
        elements.push(this.parseExpression(0));
        while (this.match("comma")) elements.push(this.parseExpression(0));
      }
      this.expect("rbracket");
      return { kind: "array", elements };
    }
    throw new ParseError(`Unexpected token '${t.value}'`, t.pos);
  }
}

export function parseExpr(src: string): Ast {
  return new Parser(src).parse();
}
