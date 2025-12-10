import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { ApiResponse } from "@/types";
import { createLessonComment, getLessonComments } from "@/lib/lesson-comments";
import { z } from "zod";

const createCommentSchema = z.object({
  content: z.string().min(1, "Комментарий не может быть пустым"),
  parentId: z.string().optional(),
});

/**
 * GET /api/lessons/[id]/comments
 * Получить комментарии к уроку
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async () => {
    try {
      const { id } = await params;
      const comments = await getLessonComments(id);

      return NextResponse.json<ApiResponse>(
        {
          success: true,
          data: comments,
        },
        { status: 200 }
      );
    } catch (error) {
      console.error("Get comments error:", error);
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Произошла ошибка при получении комментариев",
          },
        },
        { status: 500 }
      );
    }
  });
}

/**
 * POST /api/lessons/[id]/comments
 * Создать комментарий к уроку
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (req) => {
    try {
      const { id } = await params;
        const body = await request.json();
      const { content, parentId } = createCommentSchema.parse(body);

      const comment = await createLessonComment(
        id,
        req.user!.userId,
        content,
        parentId
      );

      return NextResponse.json<ApiResponse>(
        {
          success: true,
          data: comment,
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

      if (error instanceof Error) {
        if (error.message === "Lesson not found") {
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
        if (error.message === "Comments are disabled for this lesson") {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: {
                code: "COMMENTS_DISABLED",
                message: "Комментарии отключены для этого урока",
              },
            },
            { status: 403 }
          );
        }
      }

      console.error("Create comment error:", error);
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Произошла ошибка при создании комментария",
          },
        },
        { status: 500 }
      );
    }
  });
}

