import { describe, expect, it } from "vitest";
import { sanitizeTelegramHtml } from "../sanitize";

describe("tg/sanitize", () => {
  it("escapes raw text", () => {
    expect(sanitizeTelegramHtml("a < b & c > d")).toBe("a &lt; b &amp; c &gt; d");
  });

  it("keeps allowed tags as-is", () => {
    expect(sanitizeTelegramHtml("<b>bold</b> <i>it</i>")).toBe("<b>bold</b> <i>it</i>");
  });

  it("escapes unknown tags", () => {
    const out = sanitizeTelegramHtml("<script>alert(1)</script>");
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
  });

  it("keeps href on a-tag but only http(s)/tg://", () => {
    expect(sanitizeTelegramHtml('<a href="https://x">x</a>')).toBe('<a href="https://x">x</a>');
    expect(sanitizeTelegramHtml('<a href="javascript:alert(1)">x</a>')).toBe("x");
  });

  it("strips event-handler attributes", () => {
    const out = sanitizeTelegramHtml('<b onclick="alert(1)">x</b>');
    expect(out).toBe("<b>x</b>");
  });

  it("preserves tg-spoiler span", () => {
    expect(sanitizeTelegramHtml('<span class="tg-spoiler">x</span>')).toBe(
      '<span class="tg-spoiler">x</span>'
    );
  });
});
