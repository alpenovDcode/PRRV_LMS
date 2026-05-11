import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { UserRole } from "@prisma/client";
import { ApiResponse } from "@/types";

// GET /api/curator/lessons/[id] — view-only lesson for curators/admins
// Returns the full lesson regardless of enrollment / drip / prerequisites.
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return withAuth(
    request,
    async () => {
      const { id } = await context.params;
      const lesson = await db.lesson.findUnique({
        where: { id },
        include: {
          module: {
            include: {
              course: { select: { id: true, title: true, slug: true } },
            },
          },
        },
      });
      if (!lesson) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: { code: "NOT_FOUND", message: "Урок не найден" } },
          { status: 404 }
        );
      }
      return NextResponse.json<ApiResponse>({
        success: true,
        data: {
          id: lesson.id,
          title: lesson.title,
          type: lesson.type,
          content: lesson.content,
          videoId: lesson.videoId,
          videoDuration: lesson.videoDuration,
          thumbnailUrl: lesson.thumbnailUrl,
          isFree: lesson.isFree,
          isStopLesson: lesson.isStopLesson,
          settings: lesson.settings,
          quizMaxAttempts: lesson.quizMaxAttempts,
          quizPassingScore: lesson.quizPassingScore,
          quizTimeLimit: lesson.quizTimeLimit,
          module: lesson.module
            ? {
                id: lesson.module.id,
                title: lesson.module.title,
                course: lesson.module.course,
              }
            : null,
        },
      });
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}
