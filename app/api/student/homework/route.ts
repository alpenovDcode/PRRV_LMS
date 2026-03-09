import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";

export async function GET(request: NextRequest) {
  return withAuth(
    request,
    async (req) => {
      try {
        const userId = req.user!.userId;

        const submissions = await db.homeworkSubmission.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
          include: {
            lesson: {
              select: {
                id: true,
                title: true,
                module: {
                  select: {
                    course: {
                      select: {
                        id: true,
                        title: true,
                        slug: true,
                      },
                    },
                  },
                },
              },
            },
            curator: {
              select: {
                id: true,
                fullName: true,
                avatarUrl: true,
              },
            },
          },
        });

        // Форматируем данные, чтобы было удобнее использовать на фронтенде
        const formattedSubmissions = submissions.map((sub) => {
          return {
            id: sub.id,
            status: sub.status,
            content: sub.content,
            files: sub.files,
            curatorComment: sub.curatorComment,
            curatorAudioUrl: sub.curatorAudioUrl,
            reviewedAt: sub.reviewedAt,
            createdAt: sub.createdAt,
            lesson: sub.lesson ? {
              id: sub.lesson.id,
              title: sub.lesson.title,
              courseId: sub.lesson.module.course.id,
              courseTitle: sub.lesson.module.course.title,
              courseSlug: sub.lesson.module.course.slug,
            } : null,
            curator: sub.curator ? {
              id: sub.curator.id,
              name: sub.curator.fullName,
              avatarUrl: sub.curator.avatarUrl,
            } : null,
          };
        });

        return NextResponse.json<ApiResponse>(
          { success: true, data: formattedSubmissions },
          { status: 200 }
        );
      } catch (error) {
        console.error("Get student homework error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Не удалось загрузить историю домашних заданий",
            },
          },
          { status: 500 }
        );
      }
    }
  );
}
