import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { cloudflareStream } from "@/lib/cloudflare-stream";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";

export async function POST(request: NextRequest) {
  return withAuth(
    request,
    async (req) => {
      try {
        const { name } = await request.json();

        if (!name) {
          return NextResponse.json<ApiResponse>(
            { success: false, error: { code: "BAD_REQUEST", message: "Имя файла обязательно" } },
            { status: 400 }
          );
        }

        const { uploadURL, videoId } = await cloudflareStream.createVideoUpload(name);

        return NextResponse.json<ApiResponse>({
          success: true,
          data: {
            uploadURL,
            videoId,
          },
        });
      } catch (error) {
        console.error("Upload URL generation error:", error);
        return NextResponse.json<ApiResponse>(
          { success: false, error: { code: "INTERNAL_ERROR", message: "Не удалось получить URL для загрузки" } },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}
