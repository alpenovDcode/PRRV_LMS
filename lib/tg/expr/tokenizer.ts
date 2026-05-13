// Tokenizer for the flow expression DSL.
//
// This is the lexer half of a safe mini-language used in template
// fields (e.g. `{{addDays(now, 3)}}`) and in calculator-style nodes
// (multi-line expressions). It produces a flat token stream that the
// Pratt parser in parser.ts consumes.
//
// Why a custom tokenizer instead of using a library:
//   - No eval / no Function ctor — no possibility of RCE from user
//     templates copied between bots or from imported flows.
//   - We can support SaleBot-style identifier paths (`client.x`,
//     `project.x.y`) and the `and`/`or`/`AND`/`OR` word operators
//     without monkey-patching a JS parser.
//   - The grammar is small enough (<200 LOC total) that auditing it
//     is straightforward.

export type TokenType =
  | "number"
  | "string"
  | "ident"
  | "lparen"
  | "rparen"
  | "lbracket"
  | "rbracket"
  | "comma"
  | "dot"
  | "op"
  | "word_op" // and | or | not | AND | OR | NOT
  | "true"
  | "false"
  | "null"
  | "eof";

export interface Token {
  type: TokenType;
  value: string;
  // Char offset in the source — used for error messages.
  pos: number;
}

const SINGLE_OPS = new Set("+-*/%^");
const MULTI_OP_STARTS = new Set("=!<>&|");
const KEYWORD_OPS = new Set([
  "and",
  "or",
  "not",
  "AND",
  "OR",
  "NOT",
  "&&",
  "||",
]);

function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}
function isIdentStart(ch: string): boolean {
  return (
    (ch >= "a" && ch <= "z") ||
    (ch >= "A" && ch <= "Z") ||
    ch === "_" ||
    // Cyrillic — SaleBot allows Russian variable names.
    /[Ѐ-ӿ]/.test(ch)
  );
}
function isIdentCont(ch: string): boolean {
  return isIdentStart(ch) || isDigit(ch);
}

export class TokenizerError extends Error {
  constructor(message: string, public pos: number) {
    super(`${message} at position ${pos}`);
  }
}

export function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = src.length;

  while (i < n) {
    const ch = src[i];

    // Whitespace
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i++;
      continue;
    }

    // Block comments /* ... */
    if (ch === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      if (end < 0)
        throw new TokenizerError("Unterminated /* comment", i);
      i = end + 2;
      continue;
    }

    // Line comments // ...
    if (ch === "/" && src[i + 1] === "/") {
      while (i < n && src[i] !== "\n") i++;
      continue;
    }

    // Numbers (123, 1.5, .5, 1.5e-10)
    if (isDigit(ch) || (ch === "." && isDigit(src[i + 1] ?? ""))) {
      const start = i;
      while (i < n && isDigit(src[i])) i++;
      if (src[i] === ".") {
        i++;
        while (i < n && isDigit(src[i])) i++;
      }
      if (src[i] === "e" || src[i] === "E") {
        i++;
        if (src[i] === "+" || src[i] === "-") i++;
        while (i < n && isDigit(src[i])) i++;
      }
      tokens.push({ type: "number", value: src.slice(start, i), pos: start });
      continue;
    }

    // Strings  "..." and '...'  with \" \\ \n \t \r escapes
    if (ch === '"' || ch === "'") {
      const quote = ch;
      const start = i;
      i++;
      let out = "";
      while (i < n && src[i] !== quote) {
        if (src[i] === "\\" && i + 1 < n) {
          const esc = src[i + 1];
          if (esc === "n") out += "\n";
          else if (esc === "t") out += "\t";
          else if (esc === "r") out += "\r";
          else if (esc === "\\") out += "\\";
          else if (esc === "'") out += "'";
          else if (esc === '"') out += '"';
          else out += esc;
          i += 2;
        } else {
          out += src[i];
          i++;
        }
      }
      if (i >= n) throw new TokenizerError("Unterminated string", start);
      i++; // closing quote
      tokens.push({ type: "string", value: out, pos: start });
      continue;
    }

    // Identifiers and keyword operators
    if (isIdentStart(ch)) {
      const start = i;
      while (i < n && isIdentCont(src[i])) i++;
      const lex = src.slice(start, i);
      if (lex === "true" || lex === "True") {
        tokens.push({ type: "true", value: "true", pos: start });
      } else if (lex === "false" || lex === "False") {
        tokens.push({ type: "false", value: "false", pos: start });
      } else if (lex === "null" || lex === "None") {
        tokens.push({ type: "null", value: "null", pos: start });
      } else if (KEYWORD_OPS.has(lex)) {
        // Normalise to lowercase form so the parser doesn't have to.
        const norm =
          lex === "AND" || lex === "and" || lex === "&&" ? "and" :
          lex === "OR" || lex === "or" || lex === "||" ? "or" :
          "not";
        tokens.push({ type: "word_op", value: norm, pos: start });
      } else {
        tokens.push({ type: "ident", value: lex, pos: start });
      }
      continue;
    }

    // Punctuation
    if (ch === "(") { tokens.push({ type: "lparen", value: "(", pos: i++ }); continue; }
    if (ch === ")") { tokens.push({ type: "rparen", value: ")", pos: i++ }); continue; }
    if (ch === "[") { tokens.push({ type: "lbracket", value: "[", pos: i++ }); continue; }
    if (ch === "]") { tokens.push({ type: "rbracket", value: "]", pos: i++ }); continue; }
    if (ch === ",") { tokens.push({ type: "comma", value: ",", pos: i++ }); continue; }
    if (ch === ".") { tokens.push({ type: "dot", value: ".", pos: i++ }); continue; }

    // Multi-char operators
    if (MULTI_OP_STARTS.has(ch)) {
      // == != >= <= && || (treated as word_op for and/or fallthrough)
      const two = src.slice(i, i + 2);
      if (two === "==" || two === "!=" || two === ">=" || two === "<=") {
        tokens.push({ type: "op", value: two, pos: i });
        i += 2;
        continue;
      }
      if (two === "&&") {
        tokens.push({ type: "word_op", value: "and", pos: i });
        i += 2;
        continue;
      }
      if (two === "||") {
        tokens.push({ type: "word_op", value: "or", pos: i });
        i += 2;
        continue;
      }
      if (ch === "<" || ch === ">" || ch === "!") {
        // single = not allowed (assignment is handled at the statement
        // layer, not inside expressions).
        if (ch === "!") {
          tokens.push({ type: "word_op", value: "not", pos: i });
          i++;
          continue;
        }
        tokens.push({ type: "op", value: ch, pos: i });
        i++;
        continue;
      }
      // bare '=' / '&' / '|' — not valid in expressions
      throw new TokenizerError(`Unexpected character '${ch}'`, i);
    }

    if (SINGLE_OPS.has(ch)) {
      // ** for power
      if (ch === "*" && src[i + 1] === "*") {
        tokens.push({ type: "op", value: "**", pos: i });
        i += 2;
        continue;
      }
      tokens.push({ type: "op", value: ch, pos: i });
      i++;
      continue;
    }

    throw new TokenizerError(`Unexpected character '${ch}'`, i);
  }

  tokens.push({ type: "eof", value: "", pos: i });
  return tokens;
}
