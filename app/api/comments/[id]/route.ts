import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { ApiResponse } from "@/types";
import { deleteLessonComment } from "@/lib/lesson-comments";

/**
 * DELETE /api/comments/[id]
 * Удалить комментарий (мягкое удаление)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (req) => {
    try {
      const { id } = await params;
        await deleteLessonComment(id, req.user!.userId);

      return NextResponse.json<ApiResponse>(
        {
          success: true,
          data: {
            message: "Комментарий удален",
          },
        },
        { status: 200 }
      );
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "Comment not found") {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: {
                code: "NOT_FOUND",
                message: "Комментарий не найден",
              },
            },
            { status: 404 }
          );
        }
        if (error.message === "Forbidden") {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: {
                code: "FORBIDDEN",
                message: "Нет прав на удаление этого комментария",
              },
            },
            { status: 403 }
          );
        }
      }

      console.error("Delete comment error:", error);
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Произошла ошибка при удалении комментария",
          },
        },
        { status: 500 }
      );
    }
  });
}

