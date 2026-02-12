
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { ApiResponse } from "@/types";
import { getAllComments, deleteLessonComment } from "@/lib/lesson-comments";
import { UserRole } from "@prisma/client";

/**
 * GET /api/admin/comments
 * Получить все комментарии (с пагинацией)
 */
export async function GET(request: NextRequest) {
  return withAuth(
    request,
    async () => {
      try {
        const { searchParams } = new URL(request.url);
        const page = parseInt(searchParams.get("page") || "1");
        const limit = parseInt(searchParams.get("limit") || "20");
        const lessonId = searchParams.get("lessonId") || undefined;

        const result = await getAllComments(page, limit, lessonId);

        return NextResponse.json<ApiResponse>(
          {
            success: true,
            data: result,
          },
          { status: 200 }
        );
      } catch (error) {
        console.error("Get admin comments error:", error);
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
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}

/**
 * DELETE /api/admin/comments
 * Удалить комментарий
 */
export async function DELETE(request: NextRequest) {
    return withAuth(
      request,
      async (req) => {
        try {
          const { searchParams } = new URL(request.url);
          const id = searchParams.get("id") || (await request.json()).id; 
          // Support both query param and body for delete ID (usually fetch uses method DELETE with body or query)
          // To be safe, let's use searchParams primarily for DELETE requests in Next.js/REST style.
          
          if (!id) {
             const body = await request.json().catch(() => ({}));
             if (body.id) {
                 // Fallback to body
                 await deleteLessonComment(body.id, req.user!.userId);
                 return NextResponse.json({ success: true, data: { id: body.id } });
             }

            return NextResponse.json<ApiResponse>(
              {
                success: false,
                error: {
                  code: "VALIDATION_ERROR",
                  message: "ID комментария обязателен",
                },
              },
              { status: 400 }
            );
          }
  
          await deleteLessonComment(id, req.user!.userId);
  
          return NextResponse.json<ApiResponse>(
            {
              success: true,
              data: { id },
            },
            { status: 200 }
          );
        } catch (error) {
          console.error("Delete comment error:", error);
          const message = error instanceof Error ? error.message : "Ошибка сервера";
          
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: {
                code: "INTERNAL_ERROR",
                message: "Не удалось удалить комментарий: " + message,
              },
            },
            { status: 500 }
          );
        }
      },
      { roles: [UserRole.admin] }
    );
  }
