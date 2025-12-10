import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";
import { getMediaFileSignedUrl, canUserAccessMedia } from "@/lib/media-library";
import { db } from "@/lib/db";

/**
 * GET /api/admin/media/[id]
 * Получить signed URL для доступа к медиа-файлу
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (req) => {
    try {
      const { id } = await params;
        // Проверяем доступ (для студентов - только если файл прикреплен к доступному уроку)
      if (req.user!.role === "student") {
        const hasAccess = await canUserAccessMedia(req.user!.userId, id);
        if (!hasAccess) {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: {
                code: "FORBIDDEN",
                message: "Нет доступа к этому файлу",
              },
            },
            { status: 403 }
          );
        }
      }

      const signedUrl = await getMediaFileSignedUrl(id);

      if (!signedUrl) {
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

      return NextResponse.json<ApiResponse>(
        {
          success: true,
          data: {
            signedUrl,
          },
        },
        { status: 200 }
      );
    } catch (error) {
      console.error("Get media signed URL error:", error);
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Произошла ошибка при получении ссылки на файл",
          },
        },
        { status: 500 }
      );
    }
  });
}

/**
 * DELETE /api/admin/media/[id]
 * Удалить медиа-файл (только админ)
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
        // Проверяем, используется ли файл в уроках
        const lessonMedia = await db.lessonMedia.findMany({
          where: { mediaId: id },
        });

        if (lessonMedia.length > 0) {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: {
                code: "IN_USE",
                message: "Файл используется в уроках. Сначала удалите его из уроков.",
              },
            },
            { status: 400 }
          );
        }

        await db.mediaFile.delete({
          where: { id },
        });

        return NextResponse.json<ApiResponse>(
          {
            success: true,
            data: {
              message: "Медиа-файл удален",
            },
          },
          { status: 200 }
        );
      } catch (error) {
        console.error("Delete media file error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Произошла ошибка при удалении медиа-файла",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin] }
  );
}

