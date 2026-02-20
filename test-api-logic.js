const { z } = require('zod');
const DOMPurify = require('isomorphic-dompurify');

const lessonUpdateSchema = z.object({
  title: z.string().min(1, "Название урока обязательно").optional(),
  type: z.enum(["video", "text", "quiz", "track_definition"]).optional(),
  content: z.any().optional(),
});

const payload = {
  type: "quiz",
  title: "Test",
  content: {
    questions: [
      {
        id: 1,
        type: "text",
        text: "Напишите свой ник в Telegram",
        options: ["", ""],
        correct: 0
      }
    ],
    videos: [],
    links: []
  }
};

const SANITIZE_CONFIG = {
  richText: {
    ALLOWED_TAGS: ["p", "br", "strong", "em", "u", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "blockquote", "code", "pre", "a", "img"],
    ALLOWED_ATTR: ["href", "src", "alt", "title", "class"],
  }
};

function sanitizeHtml(content) {
  if (!content) return "";
  const result = DOMPurify.sanitize(String(content), { ...SANITIZE_CONFIG.richText, KEEP_CONTENT: true, RETURN_TRUSTED_TYPE: false });
  return typeof result === "string" ? result : String(result);
}

function sanitizeJsonContent(jsonContent) {
  if (!jsonContent) return jsonContent;
  if (typeof jsonContent === "string") return sanitizeHtml(jsonContent);
  if (Array.isArray(jsonContent)) return jsonContent.map((item) => sanitizeJsonContent(item));
  if (typeof jsonContent === "object") {
    const sanitized = {};
    for (const [key, value] of Object.entries(jsonContent)) {
      if (typeof value === "string") {
        sanitized[key] = sanitizeHtml(value);
      } else if (typeof value === "object") {
        sanitized[key] = sanitizeJsonContent(value);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }
  return jsonContent;
}

try {
  const parsed = lessonUpdateSchema.parse(payload);
  console.log("Parsed content:", JSON.stringify(parsed.content));
  const sanitized = sanitizeJsonContent(parsed.content);
  console.log("Sanitized content:", JSON.stringify(sanitized));
} catch (e) {
  console.error("Error:", e);
}
