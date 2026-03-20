import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { UserRole } from "@prisma/client";
import { saveFile } from "@/lib/storage";
import { ApiResponse } from "@/types";

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

        // Validate file type (images only for now)
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
