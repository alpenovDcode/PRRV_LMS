import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";
import { createMediaFile } from "@/lib/media-library";
import { db } from "@/lib/db";
import { z } from "zod";

const createMediaSchema = z.object({
  name: z.string().min(1),
  originalName: z.string().min(1),
  mimeType: z.string().min(1),
  size: z.number().int().positive(),
  url: z.string().url(),
});

/**
 * GET /api/admin/media
 * Получить список медиа-файлов
 */
export async function GET(request: NextRequest) {
  return withAuth(
    request,
    async () => {
      try {
        const { searchParams } = new URL(request.url);
        const mimeType = searchParams.get("mimeType");
        const limit = parseInt(searchParams.get("limit") || "50");
        const offset = parseInt(searchParams.get("offset") || "0");

        const mediaFiles = await db.mediaFile.findMany({
          where: mimeType ? { mimeType } : undefined,
          include: {
            uploadedBy: {
              select: {
                id: true,
                email: true,
                fullName: true,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
          take: limit,
          skip: offset,
        });

        const total = await db.mediaFile.count({
          where: mimeType ? { mimeType } : undefined,
        });

        return NextResponse.json<ApiResponse>(
          {
            success: true,
            data: {
              files: mediaFiles,
              total,
              limit,
              offset,
            },
          },
          { status: 200 }
        );
      } catch (error) {
        console.error("Get media files error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Произошла ошибка при получении медиа-файлов",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin] }
  );
}

/**
 * POST /api/admin/media
 * Создать запись о медиа-файле
 */
export async function POST(request: NextRequest) {
  return withAuth(
    request,
    async (req) => {
      try {
        const body = await request.json();
        const { name, originalName, mimeType, size, url } =
          createMediaSchema.parse(body);

        const mediaFile = await createMediaFile(
          req.user!.userId,
          name,
          originalName,
          mimeType,
          size,
          url
        );

        return NextResponse.json<ApiResponse>(
          {
            success: true,
            data: mediaFile,
          },
          { status: 201 }
        );
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

        console.error("Create media file error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Произошла ошибка при создании медиа-файла",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin] }
  );
}
