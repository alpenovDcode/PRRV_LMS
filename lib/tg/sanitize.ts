// Telegram HTML message sanitizer.
// Telegram supports a small whitelist of HTML tags. Everything else
// must be escaped. We can't trust flow authors (operators of the school
// could paste arbitrary HTML, and a misconfigured ai_reply may produce
// rogue tags). Keep it strict.
//
// Allowed (per https://core.telegram.org/bots/api#html-style):
//   b, strong, i, em, u, ins, s, strike, del, code, pre, a (href), span (tg-spoiler), tg-spoiler, blockquote, br

const ALLOWED = new Set([
  "b", "strong", "i", "em", "u", "ins", "s", "strike", "del",
  "code", "pre", "a", "tg-spoiler", "blockquote", "br", "span",
]);

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Lightweight pass that:
//  - escapes everything by default
//  - re-inserts allowed tags (open/close/self-closing <br/>) as-is
//  - for <a>, keeps only href="..." (http/https/tg://); drops the wrapper
//    AND the matching closing </a> if href is missing or has a bad scheme
//  - for <span>, keeps only class="tg-spoiler"; drops the wrapper AND the
//    matching closing tag otherwise
export function sanitizeTelegramHtml(raw: string): string {
  const out: string[] = [];
  const re = /<\/?([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*)>/g;
  // Counters for closing tags whose matching open was dropped.
  let aDropDepth = 0;
  let spanDropDepth = 0;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    if (m.index > last) {
      out.push(escapeHtml(raw.substring(last, m.index)));
    }
    const tag = m[1].toLowerCase();
    const isClose = m[0].startsWith("</");
    const attrs = m[2] ?? "";
    if (!ALLOWED.has(tag)) {
      out.push(escapeHtml(m[0]));
    } else if (tag === "a" && !isClose) {
      const hrefMatch = attrs.match(/\bhref\s*=\s*("([^"]*)"|'([^']*)')/i);
      const href = (hrefMatch?.[2] ?? hrefMatch?.[3] ?? "").trim();
      if (/^(https?:|tg:\/\/)/i.test(href)) {
        out.push(`<a href="${escapeHtml(href)}">`);
      } else {
        aDropDepth++;
      }
    } else if (tag === "a" && isClose) {
      if (aDropDepth > 0) {
        aDropDepth--;
      } else {
        out.push("</a>");
      }
    } else if (tag === "span" && !isClose) {
      if (/class\s*=\s*("|')tg-spoiler\1/i.test(attrs)) {
        out.push(`<span class="tg-spoiler">`);
      } else {
        spanDropDepth++;
      }
    } else if (tag === "span" && isClose) {
      if (spanDropDepth > 0) {
        spanDropDepth--;
      } else {
        out.push("</span>");
      }
    } else {
      out.push(isClose ? `</${tag}>` : `<${tag}>`);
    }
    last = re.lastIndex;
  }
  if (last < raw.length) {
    out.push(escapeHtml(raw.substring(last)));
  }
  return out.join("");
}
