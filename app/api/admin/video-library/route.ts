import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { z } from "zod";

const createVideoSchema = z.object({
  title: z.string().min(1, "Название обязательно"),
  cloudflareId: z.string().min(1, "Cloudflare ID обязателен"),
  duration: z.coerce.number().int().nonnegative().optional(),
});

export async function GET(request: NextRequest) {
  return withAuth(request, async (req) => {
    try {
      const { searchParams } = new URL(request.url);
      const query = searchParams.get("query") || "";

      const videos = await db.videoLibrary.findMany({
        where: {
          title: {
            contains: query,
            mode: "insensitive",
          },
        },
        orderBy: { title: "asc" },
        take: 1000,
      });

      return NextResponse.json<ApiResponse>({
        success: true,
        data: videos,
      });
    } catch (error) {
      console.error("Video library fetch error:", error);
      return NextResponse.json<ApiResponse>(
        { success: false, error: { code: "INTERNAL_ERROR", message: "Не удалось получить список видео" } },
        { status: 500 }
      );
    }
  });
}

export async function POST(request: NextRequest) {
  return withAuth(request, async (req) => {
    try {
      const body = await request.json();
      const { title, cloudflareId, duration } = createVideoSchema.parse(body);

      const existingVideo = await db.videoLibrary.findUnique({
        where: { cloudflareId },
      });

      if (existingVideo) {
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "ALREADY_EXISTS",
              message: "Видео с таким ID уже существует",
            },
          },
          { status: 400 }
        );
      }

      const video = await db.videoLibrary.create({
        data: {
          title,
          cloudflareId,
          duration,
        },
      });

      return NextResponse.json<ApiResponse>({
        success: true,
        data: video,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: error.errors[0].message,
            },
          },
          { status: 400 }
        );
      }
      console.error("Video library create error:", error);
      return NextResponse.json<ApiResponse>(
        { success: false, error: { code: "INTERNAL_ERROR", message: "Не удалось добавить видео" } },
        { status: 500 }
      );
    }
  });
}
