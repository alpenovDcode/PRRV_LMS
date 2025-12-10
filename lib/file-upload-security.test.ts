import { describe, it, expect } from "vitest";
import { validateFile, validateMimeType, validateFileSize, sanitizeFilename, generateUniqueFilename } from "@/lib/file-upload-security";

describe("File Upload Security Tests", () => {
  describe("MIME Type Validation", () => {
    it("should accept valid image MIME types", () => {
      expect(validateMimeType("image/jpeg", "images")).toBe(true);
      expect(validateMimeType("image/png", "images")).toBe(true);
      expect(validateMimeType("image/gif", "images")).toBe(true);
      expect(validateMimeType("image/webp", "images")).toBe(true);
    });

    it("should reject invalid MIME types for images", () => {
      expect(validateMimeType("application/x-executable", "images")).toBe(false);
      expect(validateMimeType("text/html", "images")).toBe(false);
      expect(validateMimeType("application/javascript", "images")).toBe(false);
    });

    it("should accept valid document MIME types", () => {
      expect(validateMimeType("application/pdf", "documents")).toBe(true);
      expect(validateMimeType("application/msword", "documents")).toBe(true);
      expect(validateMimeType("text/plain", "documents")).toBe(true);
    });

    it("should reject executable files", () => {
      expect(validateMimeType("application/x-msdownload", "documents")).toBe(false);
      expect(validateMimeType("application/x-executable", "documents")).toBe(false);
    });
  });

  describe("File Size Validation", () => {
    it("should accept files within size limits", () => {
      expect(validateFileSize(5 * 1024 * 1024, "images")).toBe(true); // 5MB
      expect(validateFileSize(20 * 1024 * 1024, "documents")).toBe(true); // 20MB
    });

    it("should reject files exceeding size limits", () => {
      expect(validateFileSize(15 * 1024 * 1024, "images")).toBe(false); // 15MB > 10MB limit
      expect(validateFileSize(30 * 1024 * 1024, "documents")).toBe(false); // 30MB > 25MB limit
    });

    it("should handle edge cases at exact limits", () => {
      expect(validateFileSize(10 * 1024 * 1024, "images")).toBe(true); // Exactly 10MB
      expect(validateFileSize(10 * 1024 * 1024 + 1, "images")).toBe(false); // 1 byte over
    });
  });

  describe("Filename Sanitization", () => {
    it("should remove path traversal attempts", () => {
      const malicious = "../../etc/passwd";
      const sanitized = sanitizeFilename(malicious);
      
      expect(sanitized).not.toContain("..");
      expect(sanitized).not.toContain("/");
    });

    it("should remove dangerous characters", () => {
      const malicious = "file<script>.txt";
      const sanitized = sanitizeFilename(malicious);
      
      expect(sanitized).not.toContain("<");
      expect(sanitized).not.toContain(">");
      // Note: "script" as text is safe in filenames, only <> are dangerous
      expect(sanitized).toContain("txt");
    });

    it("should preserve safe filenames", () => {
      const safe = "my-document_2024.pdf";
      const sanitized = sanitizeFilename(safe);
      
      expect(sanitized).toContain("my-document_2024");
      expect(sanitized).toContain(".pdf");
    });

    it("should handle null bytes", () => {
      const malicious = "file\0.txt";
      const sanitized = sanitizeFilename(malicious);
      
      expect(sanitized).not.toContain("\0");
    });

    it("should limit filename length", () => {
      const longName = "a".repeat(300) + ".txt";
      const sanitized = sanitizeFilename(longName);
      
      expect(sanitized.length).toBeLessThanOrEqual(255);
    });

    it("should handle unicode characters", () => {
      const unicode = "документ_2024.pdf";
      const sanitized = sanitizeFilename(unicode);
      
      // Should replace non-ASCII with underscores
      expect(sanitized).toMatch(/^[a-zA-Z0-9._-]+$/);
    });
  });

  describe("Unique Filename Generation", () => {
    it("should generate unique filenames", () => {
      const filename1 = generateUniqueFilename("test.pdf");
      const filename2 = generateUniqueFilename("test.pdf");
      
      expect(filename1).not.toBe(filename2);
      expect(filename1).toContain(".pdf");
      expect(filename2).toContain(".pdf");
    });

    it("should preserve file extension", () => {
      const unique = generateUniqueFilename("document.docx");
      
      expect(unique).toMatch(/\.docx$/);
    });

    it("should include timestamp", () => {
      const unique = generateUniqueFilename("file.txt");
      const timestamp = Date.now().toString();
      
      // Should contain a timestamp close to current time
      expect(unique).toMatch(/\d{13}/); // 13-digit timestamp
    });
  });

  describe("Magic Bytes Validation", () => {
    it("should validate JPEG magic bytes", async () => {
      // JPEG magic bytes: FF D8 FF
      const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
      const blob = new Blob([jpegBytes]);
      const file = new File([blob], "test.jpg", { type: "image/jpeg" });
      
      const result = await validateFile(file, { category: "images", checkMagicBytes: true });
      
      expect(result.valid).toBe(true);
    });

    it("should validate PNG magic bytes", async () => {
      // PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
      const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const blob = new Blob([pngBytes]);
      const file = new File([blob], "test.png", { type: "image/png" });
      
      const result = await validateFile(file, { category: "images", checkMagicBytes: true });
      
      expect(result.valid).toBe(true);
    });

    it("should reject file with mismatched magic bytes", async () => {
      // Text content but claiming to be JPEG
      const textBytes = new TextEncoder().encode("This is not an image");
      const blob = new Blob([textBytes]);
      const file = new File([blob], "fake.jpg", { type: "image/jpeg" });
      
      const result = await validateFile(file, { category: "images", checkMagicBytes: true });
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain("does not match");
    });
  });

  describe("Comprehensive File Validation", () => {
    it("should validate a legitimate image file", async () => {
      const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(100).fill(0)]);
      const blob = new Blob([jpegBytes]);
      const file = new File([blob], "photo.jpg", { type: "image/jpeg" });
      
      const result = await validateFile(file, { category: "images" });
      
      expect(result.valid).toBe(true);
      expect(result.sanitizedFilename).toBeTruthy();
    });

    it("should reject oversized files", async () => {
      // Create 15MB file (exceeds 10MB image limit)
      const largeBytes = new Uint8Array(15 * 1024 * 1024);
      const blob = new Blob([largeBytes]);
      const file = new File([blob], "large.jpg", { type: "image/jpeg" });
      
      const result = await validateFile(file, { category: "images" });
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain("too large");
    });

    it("should reject files with invalid MIME type", async () => {
      const blob = new Blob(["content"]);
      const file = new File([blob], "script.exe", { type: "application/x-msdownload" });
      
      const result = await validateFile(file, { category: "documents" });
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Invalid file type");
    });
  });

  describe("Real-world Attack Scenarios", () => {
    it("should reject PHP file disguised as image", async () => {
      const phpContent = new TextEncoder().encode("<?php system($_GET['cmd']); ?>");
      const blob = new Blob([phpContent]);
      const file = new File([blob], "shell.php.jpg", { type: "image/jpeg" });
      
      const result = await validateFile(file, { category: "images", checkMagicBytes: true });
      
      expect(result.valid).toBe(false);
    });

    it("should reject executable with fake extension", async () => {
      const exeBytes = new Uint8Array([0x4d, 0x5a]); // MZ header (Windows executable)
      const blob = new Blob([exeBytes]);
      const file = new File([blob], "document.pdf.exe", { type: "application/pdf" });
      
      const result = await validateFile(file, { category: "documents", checkMagicBytes: true });
      
      expect(result.valid).toBe(false);
    });

    it("should handle double extension attacks", () => {
      const malicious = "image.jpg.php";
      const sanitized = sanitizeFilename(malicious);
      
      // Filename sanitization preserves extensions
      // Security is enforced by MIME type validation, not filename
      expect(sanitized).toBeTruthy();
      expect(sanitized).not.toContain("/");
      expect(sanitized).not.toContain("..");
    });
  });
});
