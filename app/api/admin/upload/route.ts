import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { UserRole } from "@prisma/client";
import { saveFile } from "@/lib/storage";
import { ApiResponse } from "@/types";

/**
 * Проверяет магические байты файла для определения его реального MIME-типа.
 * Защищает от загрузки переименованных файлов (content-type spoofing).
 */
async function verifyImageMagicBytes(file: File): Promise<boolean> {
  const buffer = new Uint8Array(await file.arrayBuffer());
  
  const signatures: { bytes: number[]; mask?: number[] }[] = [
    { bytes: [0xFF, 0xD8, 0xFF] },                                  // JPEG
    { bytes: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] }, // PNG
    { bytes: [0x47, 0x49, 0x46, 0x38] },                           // GIF
    { bytes: [0x52, 0x49, 0x46, 0x46] },                           // WebP (RIFF header)
    { bytes: [0x42, 0x4D] },                                       // BMP
    { bytes: [0x49, 0x49, 0x2A, 0x00] },                          // TIFF (little-endian)
    { bytes: [0x4D, 0x4D, 0x00, 0x2A] },                          // TIFF (big-endian)
    { bytes: [0x00, 0x00, 0x01, 0x00] },                          // ICO
  ];

  for (const sig of signatures) {
    if (sig.bytes.every((byte, i) => buffer[i] === byte)) {
      return true;
    }
  }

  return false;
}

/**
 * POST /api/admin/upload
 * Универсальный эндпоинт для загрузки файлов (изображений)
 */
export async function POST(request: NextRequest) {
  return withAuth(
    request,
    async () => {
      try {
        const formData = await request.formData();
        const file = formData.get("file") as File;

        if (!file) {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: {
                code: "MISSING_FILE",
                message: "Файл не предоставлен",
              },
            },
            { status: 400 }
          );
        }

        // Validate file type (images only) — проверяем и Content-Type, и реальные байты
        if (!file.type.startsWith("image/")) {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: {
                code: "INVALID_FILE_TYPE",
                message: "Разрешены только изображения",
              },
            },
            { status: 400 }
          );
        }

        // Magic bytes: проверяем реальное содержимое файла, а не Content-Type что передаёт клиент
        const isRealImage = await verifyImageMagicBytes(file);
        if (!isRealImage) {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: {
                code: "INVALID_FILE_CONTENT",
                message: "Файл не является изображением. Загрузка отклонена.",
              },
            },
            { status: 400 }
          );
        }

        // Validate file size (max 5MB)
        const maxSize = 100 * 1024 * 1024; // 100MB
        if (file.size > maxSize) {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: {
                code: "FILE_TOO_LARGE",
                message: "Размер файла не должен превышать 100MB",
              },
            },
            { status: 400 }
          );
        }

        // Save file using existing storage utility (R2 or local)
        const url = await saveFile(file);

        return NextResponse.json<ApiResponse>(
          {
            success: true,
            data: {
              url,
            },
          },
          { status: 200 }
        );
      } catch (error) {
        console.error("Upload error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "UPLOAD_ERROR",
              message: "Ошибка при загрузке файла",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}
