import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { UserRole } from "@prisma/client";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
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

        // Upload to local storage
        const uploadDir = join(process.cwd(), "public", "uploads", "certificates");
        await mkdir(uploadDir, { recursive: true });

        const filename = `${Date.now()}-${file.name}`;
        const filepath = join(uploadDir, filename);
        
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        await writeFile(filepath, buffer);

        const url = `/uploads/certificates/${filename}`;

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
