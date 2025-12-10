import { NextRequest, NextResponse } from "next/server";
import { saveFile } from "@/lib/storage";
import { verifyAccessTokenEdge } from "@/lib/auth-edge";
import { ApiResponse } from "@/types";
import {
  logSuspiciousActivity,
  detectSuspiciousPatterns,
  getClientIp,
  getUserAgent,
} from "@/lib/security-logging";
import { validateFile, sanitizeFilename } from "@/lib/file-upload-security";

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const token = request.cookies.get("accessToken")?.value;
    const payload = token ? await verifyAccessTokenEdge(token) : null;
    
    if (!token || !payload) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: { code: "UNAUTHORIZED", message: "Unauthorized" } },
        { status: 401 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;
    const category = (formData.get("category") as string) || "documents";

    if (!file) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: { code: "BAD_REQUEST", message: "Файл не предоставлен" } },
        { status: 400 }
      );
    }

    // Проверка на подозрительные паттерны в имени файла
    const suspiciousPatterns = detectSuspiciousPatterns({
      ip: getClientIp(request),
      userAgent: getUserAgent(request),
      path: request.nextUrl.pathname,
      method: request.method,
      body: file.name,
    });

    if (suspiciousPatterns.length > 0) {
      await logSuspiciousActivity(payload.userId, "FILE_UPLOAD", {
        ip: getClientIp(request) || undefined,
        userAgent: getUserAgent(request) || undefined,
        path: request.nextUrl.pathname,
        reason: `Suspicious file name patterns: ${suspiciousPatterns.join(", ")}`,
        metadata: { fileName: file.name, patterns: suspiciousPatterns },
      });
    }

    // Comprehensive file validation with magic bytes checking
    const validationResult = await validateFile(file, {
      category: category as "images" | "documents" | "videos" | "archives",
      checkMagicBytes: true,
    });

    if (!validationResult.valid) {
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: {
            code: "BAD_REQUEST",
            message: validationResult.error || "File validation failed",
          },
        },
        { status: 400 }
      );
    }

    // Save file with sanitized filename
    const fileUrl = await saveFile(file, validationResult.sanitizedFilename);

    return NextResponse.json<ApiResponse>(
      {
        success: true,
        data: {
          url: fileUrl,
          name: validationResult.sanitizedFilename || file.name,
          originalName: sanitizeFilename(file.name),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json<ApiResponse>(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Failed to upload file" } },
      { status: 500 }
    );
  }
}
