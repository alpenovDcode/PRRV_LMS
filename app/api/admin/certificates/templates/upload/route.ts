import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { UserRole } from "@prisma/client";
import { put } from "@vercel/blob";
import { ApiResponse } from "@/types";

export async function POST(request: NextRequest) {
  return withAuth(
    request,
    async (req) => {
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

        // Validate file type
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

        // Validate file size (max 10MB)
        const maxSize = 10 * 1024 * 1024; // 10MB
        if (file.size > maxSize) {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: {
                code: "FILE_TOO_LARGE",
                message: "Размер файла не должен превышать 10MB",
              },
            },
            { status: 400 }
          );
        }

        // Upload to Vercel Blob
        const blob = await put(`certificates/${Date.now()}-${file.name}`, file, {
          access: "public",
        });

        return NextResponse.json<ApiResponse>(
          {
            success: true,
            data: {
              url: blob.url,
            },
          },
          { status: 200 }
        );
      } catch (error) {
        console.error("Certificate template upload error:", error);
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
    { roles: [UserRole.admin] }
  );
}
