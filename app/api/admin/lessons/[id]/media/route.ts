import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";
import { attachMediaToLesson } from "@/lib/media-library";
import { db } from "@/lib/db";
import { z } from "zod";

const attachMediaSchema = z.object({
  mediaId: z.string().uuid(),
  orderIndex: z.number().int().optional(),
});

/**
 * POST /api/admin/lessons/[id]/media
 * Прикрепить медиа-файл к уроку
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    request,
    async () => {
        const { id } = await params;
      try {
        const body = await request.json();
        const { mediaId, orderIndex } = attachMediaSchema.parse(body);

        // Проверяем существование урока
        const lesson = await db.lesson.findUnique({
          where: { id },
          select: { id: true },
        });

        if (!lesson) {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: {
                code: "NOT_FOUND",
                message: "Урок не найден",
              },
            },
            { status: 404 }
          );
        }

        // Проверяем существование медиа-файла
        const media = await db.mediaFile.findUnique({
          where: { id: mediaId },
          select: { id: true },
        });

        if (!media) {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: {
                code: "NOT_FOUND",
                message: "Медиа-файл не найден",
              },
            },
            { status: 404 }
          );
        }

        const lessonMedia = await attachMediaToLesson(
          id,
          mediaId,
          orderIndex
        );

        return NextResponse.json<ApiResponse>(
          {
            success: true,
            data: lessonMedia,
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

        console.error("Attach media to lesson error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Произошла ошибка при прикреплении файла",
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
 * DELETE /api/admin/lessons/[id]/media
 * Открепить медиа-файл от урока
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    request,
    async () => {
        const { id } = await params;
      try {
        const { searchParams } = new URL(request.url);
        const mediaId = searchParams.get("mediaId");

        if (!mediaId) {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: {
                code: "VALIDATION_ERROR",
                message: "mediaId обязателен",
              },
            },
            { status: 400 }
          );
        }

        await db.lessonMedia.delete({
          where: {
            lessonId_mediaId: {
              lessonId: id,
              mediaId,
            },
          },
        });

        return NextResponse.json<ApiResponse>(
          {
            success: true,
            data: {
              message: "Медиа-файл откреплен от урока",
            },
          },
          { status: 200 }
        );
      } catch (error) {
        console.error("Detach media from lesson error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Произошла ошибка при откреплении файла",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin] }
  );
}

