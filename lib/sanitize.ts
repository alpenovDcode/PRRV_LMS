/**
 * Content sanitization - wrapper for backward compatibility
 * This file now uses the new content-sanitization.ts library
 */

import {
  sanitizeHtml as sanitizeHtmlNew,
  sanitizeHomeworkContent,
  sanitizeCommentContent,
  sanitizePlainText as sanitizePlainTextNew,
} from "./content-sanitization";

/**
 * Sanitize HTML content from potentially dangerous elements
 * Used for XSS attack protection
 */
export async function sanitizeHtml(html: string): Promise<string> {
  return sanitizeHtmlNew(html, "richText");
}

/**
 * Sanitize Markdown content (removes potentially dangerous HTML)
 * Used before rendering Markdown
 */
export function sanitizeMarkdown(markdown: string): string {
  // Remove potentially dangerous constructions
  return markdown
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
    .replace(/javascript:/gi, "")
    .replace(/on\w+\s*=/gi, ""); // Remove event handlers
}

/**
 * Sanitize plain text (removes all HTML tags)
 */
export async function sanitizeText(text: string): Promise<string> {
  return sanitizePlainTextNew(text);
}

/**
 * Sanitize homework content
 */
export async function sanitizeHomework(content: string): Promise<string> {
  return sanitizeHomeworkContent(content);
}

/**
 * Sanitize comment content
 */
export async function sanitizeComment(content: string): Promise<string> {
  return sanitizeCommentContent(content);
}
