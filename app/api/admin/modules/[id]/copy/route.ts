
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { logAction } from "@/lib/audit";

const copyModuleSchema = z.object({
  targetCourseId: z.string().uuid(),
  targetParentId: z.string().uuid().optional().nullable(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    request,
    async (req) => {
      try {
        const { id: sourceModuleId } = await params;
        const body = await request.json();
        const { targetCourseId, targetParentId } = copyModuleSchema.parse(body);

        // 1. Verify source module exists
        const sourceModule = await db.module.findUnique({
          where: { id: sourceModuleId },
        });

        if (!sourceModule) {
          return NextResponse.json<ApiResponse>(
            { success: false, error: { code: "NOT_FOUND", message: "Исходный модуль не найден" } },
            { status: 404 }
          );
        }

        // 2. Verify target course exists
        const targetCourse = await db.course.findUnique({
          where: { id: targetCourseId },
        });

        if (!targetCourse) {
           return NextResponse.json<ApiResponse>(
            { success: false, error: { code: "NOT_FOUND", message: "Целевой курс не найден" } },
            { status: 404 }
          );
        }

        // 3. Recursive copy function
        const copyModuleRecursive = async (
          tx: any, 
          moduleId: string, 
          courseId: string, 
          parentId: string | null
        ): Promise<void> => {
          // Fetch full module details
          const moduleToCopy = await tx.module.findUnique({
             where: { id: moduleId },
             include: {
                lessons: {
                    include: {
                        LessonMedia: true
                    }
                },
                children: {
                    select: { id: true },
                    orderBy: { orderIndex: 'asc' }
                }
             }
          });

          if (!moduleToCopy) return;

          // Determine new order index (append to end)
          const lastModule = await tx.module.findFirst({
            where: { courseId, parentId },
            orderBy: { orderIndex: 'desc' }
          });
          const newOrderIndex = lastModule ? lastModule.orderIndex + 1 : 0;

          // Create new module
          const newModule = await tx.module.create({
            data: {
                courseId,
                parentId,
                title: moduleToCopy.title, // Keep same title
                orderIndex: newOrderIndex,
                allowedTariffs: moduleToCopy.allowedTariffs,
                allowedTracks: moduleToCopy.allowedTracks,
                allowedGroups: moduleToCopy.allowedGroups,
                // Copy other settings if needed
                openAt: moduleToCopy.openAt,
                openAfterAmount: moduleToCopy.openAfterAmount,
                openAfterUnit: moduleToCopy.openAfterUnit,
                openAfterEvent: moduleToCopy.openAfterEvent,
                trackSettings: moduleToCopy.trackSettings || undefined,
            }
          });

          // Copy Lessons
          for (const lesson of moduleToCopy.lessons) {
             const newLesson = await tx.lesson.create({
                data: {
                    moduleId: newModule.id,
                    title: lesson.title,
                    type: lesson.type,
                    content: lesson.content || undefined,
                    videoId: lesson.videoId,
                    videoDuration: lesson.videoDuration,
                    thumbnailUrl: lesson.thumbnailUrl,
                    isFree: lesson.isFree,
                    isStopLesson: lesson.isStopLesson,
                    dripRule: lesson.dripRule || undefined,
                    settings: lesson.settings || undefined,
                    orderIndex: lesson.orderIndex, // Keep relative order? Or append? usually exact copy keeps structure
                    quizMaxAttempts: lesson.quizMaxAttempts,
                    quizPassingScore: lesson.quizPassingScore,
                    quizRequiresReview: lesson.quizRequiresReview,
                    quizTimeLimit: lesson.quizTimeLimit,
                    aiPrompt: lesson.aiPrompt,
                }
             });

             // Copy Media Links
             if (lesson.LessonMedia && lesson.LessonMedia.length > 0) {
                 await tx.lessonMedia.createMany({
                    data: lesson.LessonMedia.map((lm: any) => ({
                        lessonId: newLesson.id,
                        mediaId: lm.mediaId,
                        orderIndex: lm.orderIndex
                    }))
                 });
             }
          }

          // Recursively copy children
          if (moduleToCopy.children && moduleToCopy.children.length > 0) {
             for (const child of moduleToCopy.children) {
                await copyModuleRecursive(tx, child.id, courseId, newModule.id);
             }
          }
        };

        // Execution
        await db.$transaction(async (tx) => {
            await copyModuleRecursive(tx, sourceModuleId, targetCourseId, targetParentId || null);
        });

        // Audit log
        await logAction(req.user!.userId, "COPY_MODULE", "module", sourceModuleId, {
            targetCourseId,
            targetParentId
        });

        return NextResponse.json<ApiResponse>({ success: true, data: { message: "Module copied successfully" } });

      } catch (error) {
        console.error("Copy module error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Не удалось скопировать модуль",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}
