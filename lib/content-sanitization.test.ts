import { describe, it, expect, beforeAll } from "vitest";
import { sanitizeHtml, sanitizeHomeworkContent, sanitizeCommentContent, sanitizePlainText } from "@/lib/content-sanitization";

describe("Content Sanitization Security Tests", () => {
  describe("XSS Protection", () => {
    it("should remove script tags from HTML", () => {
      const malicious = '<p>Hello</p><script>alert("XSS")</script>';
      const sanitized = sanitizeHtml(malicious, "richText");
      
      expect(sanitized).not.toContain("<script>");
      expect(sanitized).not.toContain("alert");
      expect(sanitized).toContain("Hello");
    });

    it("should remove inline event handlers", () => {
      const malicious = '<p onclick="alert(\'XSS\')">Click me</p>';
      const sanitized = sanitizeHtml(malicious, "richText");
      
      expect(sanitized).not.toContain("onclick");
      expect(sanitized).not.toContain("alert");
    });

    it("should remove javascript: URLs", () => {
      const malicious = '<a href="javascript:alert(\'XSS\')">Click</a>';
      const sanitized = sanitizeHtml(malicious, "richText");
      
      expect(sanitized).not.toContain("javascript:");
    });

    it("should remove iframe tags", () => {
      const malicious = '<p>Test</p><iframe src="evil.com"></iframe>';
      const sanitized = sanitizeHtml(malicious, "richText");
      
      expect(sanitized).not.toContain("<iframe");
      expect(sanitized).toContain("Test");
    });

    it("should remove object and embed tags", () => {
      const malicious = '<object data="evil.swf"></object><embed src="evil.swf">';
      const sanitized = sanitizeHtml(malicious, "richText");
      
      expect(sanitized).not.toContain("<object");
      expect(sanitized).not.toContain("<embed");
    });
  });

  describe("Homework Content Sanitization", () => {
    it("should allow safe formatting tags", () => {
      const content = "<p><strong>Bold</strong> and <em>italic</em> text</p>";
      const sanitized = sanitizeHomeworkContent(content);
      
      expect(sanitized).toContain("<strong>");
      expect(sanitized).toContain("<em>");
    });

    it("should remove dangerous tags from homework", () => {
      const malicious = '<p>Answer</p><script>steal()</script>';
      const sanitized = sanitizeHomeworkContent(malicious);
      
      expect(sanitized).not.toContain("<script>");
      expect(sanitized).toContain("Answer");
    });

    it("should sanitize links in homework", () => {
      const content = '<a href="https://safe.com">Link</a>';
      const sanitized = sanitizeHomeworkContent(content);
      
      expect(sanitized).toContain("https://safe.com");
      expect(sanitized).toContain("Link");
    });
  });

  describe("Comment Content Sanitization", () => {
    it("should be more restrictive than homework", () => {
      const content = '<h1>Title</h1><p>Comment</p>';
      const sanitized = sanitizeCommentContent(content);
      
      // Comments should not allow h1
      expect(sanitized).not.toContain("<h1>");
      expect(sanitized).toContain("Comment");
    });

    it("should allow basic formatting in comments", () => {
      const content = '<p><strong>Important</strong> comment</p>';
      const sanitized = sanitizeCommentContent(content);
      
      expect(sanitized).toContain("<strong>");
      expect(sanitized).toContain("comment");
    });
  });

  describe("Plain Text Sanitization", () => {
    it("should strip all HTML tags", () => {
      const content = '<p><strong>Bold</strong> text</p>';
      const sanitized = sanitizePlainText(content);
      
      expect(sanitized).not.toContain("<");
      expect(sanitized).not.toContain(">");
      expect(sanitized).toContain("Bold");
      expect(sanitized).toContain("text");
    });

    it("should handle empty input", () => {
      const sanitized = sanitizePlainText("");
      expect(sanitized).toBe("");
    });

    it("should handle null bytes", () => {
      const malicious = "text\0with\0nulls";
      const sanitized = sanitizePlainText(malicious);
      
      expect(sanitized).not.toContain("\0");
    });
  });

  describe("Edge Cases", () => {
    it("should handle very long content", () => {
      const longContent = "<p>" + "a".repeat(15000) + "</p>";
      const sanitized = sanitizeHtml(longContent, "richText");
      
      // Sanitization removes dangerous content but doesn't truncate
      // Truncation happens at input validation level (sanitizeUserInput)
      expect(sanitized).toBeTruthy();
      expect(sanitized).not.toContain("<script>");
    });

    it("should handle nested tags", () => {
      const nested = "<p><strong><em><u>Text</u></em></strong></p>";
      const sanitized = sanitizeHtml(nested, "richText");
      
      expect(sanitized).toContain("Text");
    });

    it("should handle malformed HTML", () => {
      const malformed = "<p>Unclosed<strong>tag";
      const sanitized = sanitizeHtml(malformed, "richText");
      
      // Should not throw error
      expect(sanitized).toBeTruthy();
    });

    it("should handle unicode and special characters", () => {
      const unicode = "<p>Привет мир! 你好世界 🎉</p>";
      const sanitized = sanitizeHtml(unicode, "richText");
      
      expect(sanitized).toContain("Привет");
      expect(sanitized).toContain("你好");
      expect(sanitized).toContain("🎉");
    });
  });

  describe("Real-world XSS Payloads", () => {
    const xssPayloads = [
      '<img src=x onerror=alert(1)>',
      '<svg onload=alert(1)>',
      '<body onload=alert(1)>',
      '<input onfocus=alert(1) autofocus>',
      '<select onfocus=alert(1) autofocus>',
      '<textarea onfocus=alert(1) autofocus>',
      '<iframe src="javascript:alert(1)">',
      '<object data="javascript:alert(1)">',
      '<embed src="javascript:alert(1)">',
      '<a href="javascript:alert(1)">click</a>',
      '<form action="javascript:alert(1)"><input type="submit">',
      '<button formaction="javascript:alert(1)">click</button>',
    ];

    xssPayloads.forEach((payload, index) => {
      it(`should block XSS payload #${index + 1}`, () => {
        const sanitized = sanitizeHtml(payload, "richText");
        
        expect(sanitized).not.toContain("alert");
        expect(sanitized).not.toContain("javascript:");
        expect(sanitized).not.toContain("onerror");
        expect(sanitized).not.toContain("onload");
        expect(sanitized).not.toContain("onfocus");
      });
    });
  });
});
