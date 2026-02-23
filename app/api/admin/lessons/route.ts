import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";
import { adminLessonCreateSchema } from "@/lib/validations";
import { logAction } from "@/lib/audit";

export async function POST(request: NextRequest) {
  return withAuth(
    request,
    async (req) => {
      try {
        const body = await request.json();
        const { moduleId, title, type } = adminLessonCreateSchema.parse(body);

        // Проверяем существование модуля
        const moduleData = await db.module.findUnique({
          where: { id: moduleId },
          select: { id: true, courseId: true },
        });

        if (!moduleData) {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: {
                code: "NOT_FOUND",
                message: "Модуль не найден",
              },
            },
            { status: 404 }
          );
        }

        // Используем транзакцию для атомарного получения orderIndex и создания урока
        const lesson = await db.$transaction(async (tx) => {
          const lastLesson = await tx.lesson.findFirst({
            where: { moduleId },
            orderBy: { orderIndex: "desc" },
          });

          const orderIndex = lastLesson ? lastLesson.orderIndex + 1 : 0;

          return await tx.lesson.create({
            data: {
              moduleId,
              title,
              type: type || "video",
              orderIndex,
            },
          });
        });

        // Audit log
        await logAction(req.user!.userId, "CREATE_LESSON", "lesson", lesson.id, {
          title: lesson.title,
          moduleId,
          courseId: moduleData.courseId,
        });

        return NextResponse.json<ApiResponse>({ success: true, data: lesson }, { status: 201 });
      } catch (error) {
        console.error("Create lesson error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Не удалось создать урок",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}


