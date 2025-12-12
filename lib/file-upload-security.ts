/**
 * File upload security utilities
 */

// Allowed MIME types for different file categories
export const ALLOWED_MIME_TYPES = {
  images: [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/svg+xml",
  ] as const,
  documents: [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation", // .pptx
    "text/plain",
    "text/html", // .html
    "text/css", // .css
    "text/javascript", // .js
    "application/javascript", // .js
    "application/json", // .json
    "application/xml", // .xml
    "text/xml", // .xml
    "application/zip", // .zip
    "application/x-zip-compressed", // .zip
    "application/x-rar-compressed", // .rar
    "application/x-7z-compressed", // .7z
    // Images (for screenshots, diagrams, etc.)
    "image/jpeg", // .jpg, .jpeg
    "image/jpg", // .jpg
    "image/png", // .png
    "image/gif", // .gif
    "image/webp", // .webp
    "image/svg+xml", // .svg
  ] as const,
  videos: [
    "video/mp4",
    "video/mpeg",
    "video/quicktime",
    "video/x-msvideo",
    "video/webm",
  ] as const,
  archives: [
    "application/zip",
    "application/x-rar-compressed",
    "application/x-7z-compressed",
  ] as const,
};

// File size limits (in bytes)
export const FILE_SIZE_LIMITS = {
  images: 10 * 1024 * 1024, // 10MB
  documents: 25 * 1024 * 1024, // 25MB
  videos: 500 * 1024 * 1024, // 500MB
  archives: 50 * 1024 * 1024, // 50MB
  default: 10 * 1024 * 1024, // 10MB
} as const;

// Magic bytes for file type validation
const MAGIC_BYTES: Record<string, number[][]> = {
  "image/jpeg": [
    [0xff, 0xd8, 0xff],
  ],
  "image/png": [
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  ],
  "image/gif": [
    [0x47, 0x49, 0x46, 0x38, 0x37, 0x61], // GIF87a
    [0x47, 0x49, 0x46, 0x38, 0x39, 0x61], // GIF89a
  ],
  "image/webp": [
    [0x52, 0x49, 0x46, 0x46], // RIFF
  ],
  "application/pdf": [
    [0x25, 0x50, 0x44, 0x46], // %PDF
  ],
  "application/zip": [
    [0x50, 0x4b, 0x03, 0x04], // PK..
    [0x50, 0x4b, 0x05, 0x06], // PK.. (empty archive)
    [0x50, 0x4b, 0x07, 0x08], // PK.. (spanned archive)
  ],
  "video/mp4": [
    [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70], // ....ftyp
    [0x00, 0x00, 0x00, 0x1c, 0x66, 0x74, 0x79, 0x70], // ....ftyp
  ],
};

/**
 * Validate file MIME type against allowed types
 */
export function validateMimeType(
  mimeType: string,
  category: keyof typeof ALLOWED_MIME_TYPES
): boolean {
  const allowedTypes = ALLOWED_MIME_TYPES[category];
  return (allowedTypes as readonly string[]).includes(mimeType);
}

/**
 * Validate file size
 */
export function validateFileSize(
  size: number,
  category: keyof typeof FILE_SIZE_LIMITS
): boolean {
  const limit = FILE_SIZE_LIMITS[category] || FILE_SIZE_LIMITS.default;
  return size <= limit;
}

/**
 * Check magic bytes of file to verify actual file type
 */
export async function validateMagicBytes(
  file: File | Blob,
  expectedMimeType: string
): Promise<boolean> {
  const magicSignatures = MAGIC_BYTES[expectedMimeType];
  if (!magicSignatures) {
    // If we don't have magic bytes for this type, skip validation
    return true;
  }

  try {
    // Read first 16 bytes
    const arrayBuffer = await file.slice(0, 16).arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    // Check if any signature matches
    return magicSignatures.some((signature) => {
      return signature.every((byte, index) => bytes[index] === byte);
    });
  } catch (error) {

    return false;
  }
}

/**
 * Sanitize filename to prevent path traversal attacks
 */
export function sanitizeFilename(filename: string): string {
  // Remove any path components
  const basename = filename.split(/[/\\]/).pop() || "file";

  // Remove dangerous characters
  const sanitized = basename
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/\.{2,}/g, ".") // Remove multiple dots
    .replace(/^\./, "") // Remove leading dot
    .substring(0, 255); // Limit length

  // Ensure we have a valid filename
  return sanitized || `file_${Date.now()}`;
}

/**
 * Generate unique filename with timestamp
 */
export function generateUniqueFilename(originalFilename: string): string {
  const sanitized = sanitizeFilename(originalFilename);
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const ext = sanitized.split(".").pop();
  const nameWithoutExt = sanitized.replace(`.${ext}`, "");

  return `${nameWithoutExt}_${timestamp}_${random}.${ext}`;
}

/**
 * Comprehensive file validation
 */
export interface FileValidationOptions {
  category: keyof typeof ALLOWED_MIME_TYPES;
  sizeCategory?: keyof typeof FILE_SIZE_LIMITS;
  checkMagicBytes?: boolean;
}

export interface FileValidationResult {
  valid: boolean;
  error?: string;
  sanitizedFilename?: string;
}

export async function validateFile(
  file: File,
  options: FileValidationOptions
): Promise<FileValidationResult> {
  const { category, sizeCategory = category, checkMagicBytes = true } = options;

  // 1. Validate MIME type
  if (!validateMimeType(file.type, category)) {
    return {
      valid: false,
      error: `Invalid file type. Allowed types: ${ALLOWED_MIME_TYPES[category].join(", ")}`,
    };
  }

  // 2. Validate file size
  if (!validateFileSize(file.size, sizeCategory)) {
    const limitMB = FILE_SIZE_LIMITS[sizeCategory] / (1024 * 1024);
    return {
      valid: false,
      error: `File too large. Maximum size: ${limitMB}MB`,
    };
  }

  // 3. Validate magic bytes (actual file content)
  if (checkMagicBytes) {
    const magicBytesValid = await validateMagicBytes(file, file.type);
    if (!magicBytesValid) {
      return {
        valid: false,
        error: "File content does not match declared type",
      };
    }
  }

  // 4. Sanitize filename
  const sanitizedFilename = generateUniqueFilename(file.name);

  return {
    valid: true,
    sanitizedFilename,
  };
}
