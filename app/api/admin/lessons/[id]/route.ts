import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";
import { logAction } from "@/lib/audit";
import { z } from "zod";

const lessonUpdateSchema = z.object({
  title: z.string().min(1, "Название урока обязательно").optional(),
  type: z.enum(["video", "text", "quiz", "track_definition"]).optional(),
  content: z.any().optional(),
  videoId: z.string().nullable().optional(),
  videoDuration: z.number().int().min(0).nullable().optional(),
  thumbnailUrl: z.string().nullable().optional(),
  isFree: z.boolean().optional(),
  isStopLesson: z.boolean().optional(),
  dripRule: z.any().nullable().optional(),
  settings: z.any().nullable().optional(),
  // Quiz settings
  quizMaxAttempts: z.number().int().min(1).max(10).nullable().optional(),
  quizPassingScore: z.number().int().min(0).max(100).nullable().optional(),
  quizTimeLimit: z.number().int().min(0).nullable().optional(), // В секундах
  quizRequiresReview: z.boolean().optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    request,
    async () => {
        const { id } = await params;
      try {
        const lesson = await db.lesson.findUnique({
          where: { id },
          include: {
            module: {
              include: {
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

        return NextResponse.json<ApiResponse>({ success: true, data: lesson }, { status: 200 });
      } catch (error) {
        console.error("Get lesson error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Не удалось получить урок",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin] }
  );
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    request,
    async (req) => {
      try {
        const { id } = await params;
        const body = await request.json();
        const data = lessonUpdateSchema.parse(body);

        // Обрабатываем nullable поля
        const updateData: any = {};
        if (data.title !== undefined) updateData.title = data.title;
        if (data.type !== undefined) updateData.type = data.type;
        
        // Sanitize content if provided
        if (data.content !== undefined) {
          const { sanitizeJsonContent } = await import("@/lib/content-sanitization");
          updateData.content = sanitizeJsonContent(data.content);
        }
        
        if (data.videoId !== undefined) updateData.videoId = data.videoId;
        if (data.videoDuration !== undefined) updateData.videoDuration = data.videoDuration;
        if (data.thumbnailUrl !== undefined) updateData.thumbnailUrl = data.thumbnailUrl;
        if (data.isFree !== undefined) updateData.isFree = data.isFree;
        if (data.isStopLesson !== undefined) updateData.isStopLesson = data.isStopLesson;
        if (data.dripRule !== undefined) updateData.dripRule = data.dripRule;
        if (data.settings !== undefined) updateData.settings = data.settings;
        // Quiz settings
        if (data.quizMaxAttempts !== undefined) updateData.quizMaxAttempts = data.quizMaxAttempts;
        if (data.quizPassingScore !== undefined) updateData.quizPassingScore = data.quizPassingScore;
        if (data.quizTimeLimit !== undefined) updateData.quizTimeLimit = data.quizTimeLimit;
        if (data.quizRequiresReview !== undefined) updateData.quizRequiresReview = data.quizRequiresReview;

        const lesson = await db.lesson.update({
          where: { id },
          data: updateData,
        });

        // Audit log
        await logAction(req.user!.userId, "UPDATE_LESSON", "lesson", lesson.id, {
          title: data.title,
          type: data.type,
        });

        return NextResponse.json<ApiResponse>({ success: true, data: lesson }, { status: 200 });
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

        console.error("Update lesson error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: error instanceof Error ? error.message : "Не удалось обновить урок",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin] }
  );
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    request,
    async (req) => {
      try {
        const { id } = await params;
        // Получаем информацию об уроке перед удалением для audit log
        const lesson = await db.lesson.findUnique({
          where: { id },
          select: { id: true, title: true },
        });

        await db.lesson.delete({
          where: { id },
        });

        // Audit log
        if (lesson) {
          await logAction(req.user!.userId, "DELETE_LESSON", "lesson", lesson.id, {
            title: lesson.title,
          });
        }

        return NextResponse.json<ApiResponse>({ success: true }, { status: 200 });
      } catch (error) {
        console.error("Delete lesson error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Не удалось удалить урок",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin] }
  );
}
