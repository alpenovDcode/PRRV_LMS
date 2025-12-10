import DOMPurify from "isomorphic-dompurify";

/**
 * Content sanitization utilities to prevent XSS attacks
 */

// Configuration for different content types
const SANITIZE_CONFIG = {
  // For rich text content (homework, lesson content)
  richText: {
    ALLOWED_TAGS: [
      "p",
      "br",
      "strong",
      "em",
      "u",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "ul",
      "ol",
      "li",
      "blockquote",
      "code",
      "pre",
      "a",
      "img",
    ],
    ALLOWED_ATTR: ["href", "src", "alt", "title", "class"],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
  },
  // For comments (more restrictive)
  comment: {
    ALLOWED_TAGS: ["p", "br", "strong", "em", "u", "a", "code"],
    ALLOWED_ATTR: ["href"],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
  },
  // For plain text (strip all HTML)
  plainText: {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
  },
} as const;

/**
 * Sanitize HTML content to prevent XSS
 */
export function sanitizeHtml(
  content: string,
  type: keyof typeof SANITIZE_CONFIG = "richText"
): string {
  if (!content) return "";

  const config = SANITIZE_CONFIG[type];

  const sanitizeOptions: any = {
    ALLOWED_TAGS: config.ALLOWED_TAGS,
    ALLOWED_ATTR: config.ALLOWED_ATTR,
    KEEP_CONTENT: true,
    RETURN_TRUSTED_TYPE: false,
  };

  // Add ALLOWED_URI_REGEXP if it exists in config
  if ("ALLOWED_URI_REGEXP" in config) {
    sanitizeOptions.ALLOWED_URI_REGEXP = config.ALLOWED_URI_REGEXP;
  }

  const result = DOMPurify.sanitize(content, sanitizeOptions);
  return typeof result === "string" ? result : String(result);
}

/**
 * Sanitize user input for database storage
 */
export function sanitizeUserInput(input: string): string {
  if (!input) return "";

  // Remove null bytes
  let sanitized = input.replace(/\0/g, "");

  // Normalize whitespace
  sanitized = sanitized.replace(/\s+/g, " ").trim();

  // Limit length
  const MAX_LENGTH = 10000;
  if (sanitized.length > MAX_LENGTH) {
    sanitized = sanitized.substring(0, MAX_LENGTH);
  }

  return sanitized;
}

/**
 * Sanitize homework content
 */
export function sanitizeHomeworkContent(content: string): string {
  const sanitized = sanitizeUserInput(content);
  return sanitizeHtml(sanitized, "richText");
}

/**
 * Sanitize lesson content
 */
export function sanitizeLessonContent(content: string): string {
  const sanitized = sanitizeUserInput(content);
  return sanitizeHtml(sanitized, "richText");
}

/**
 * Sanitize comment content
 */
export function sanitizeCommentContent(content: string): string {
  const sanitized = sanitizeUserInput(content);
  return sanitizeHtml(sanitized, "comment");
}

/**
 * Sanitize plain text (strip all HTML)
 */
export function sanitizePlainText(content: string): string {
  const sanitized = sanitizeUserInput(content);
  return sanitizeHtml(sanitized, "plainText");
}

/**
 * Sanitize JSON content (for lesson.content, etc.)
 */
export function sanitizeJsonContent(jsonContent: any): any {
  if (!jsonContent) return jsonContent;

  if (typeof jsonContent === "string") {
    return sanitizeHtml(jsonContent, "richText");
  }

  if (Array.isArray(jsonContent)) {
    return jsonContent.map((item) => sanitizeJsonContent(item));
  }

  if (typeof jsonContent === "object") {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(jsonContent)) {
      if (typeof value === "string") {
        // Sanitize string values
        sanitized[key] = sanitizeHtml(value, "richText");
      } else if (typeof value === "object") {
        // Recursively sanitize nested objects
        sanitized[key] = sanitizeJsonContent(value);
      } else {
        // Keep other types as is
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  return jsonContent;
}

/**
 * Validate and sanitize URL
 */
export function sanitizeUrl(url: string): string | null {
  if (!url) return null;

  try {
    const parsed = new URL(url);

    // Only allow http and https protocols
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return null;
    }

    // Return sanitized URL
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * Sanitize email address
 */
export function sanitizeEmail(email: string): string {
  if (!email) return "";

  // Basic email sanitization
  return email.toLowerCase().trim().replace(/[^\w@.-]/g, "");
}
