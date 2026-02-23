import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";
import { adminModuleCreateSchema } from "@/lib/validations";
import { logAction } from "@/lib/audit";

export async function POST(request: NextRequest) {
  return withAuth(
    request,
    async (req) => {
      try {
        const body = await request.json();
        const { courseId, title, parentId, allowedTariffs, allowedTracks, allowedGroups } = adminModuleCreateSchema.parse(body);

        // Проверяем существование курса
        const course = await db.course.findUnique({
          where: { id: courseId },
          select: { id: true },
        });

        if (!course) {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: {
                code: "NOT_FOUND",
                message: "Курс не найден",
              },
            },
            { status: 404 }
          );
        }

        // Если указан parentId, проверяем существование родительского модуля
        if (parentId) {
          const parentModule = await db.module.findUnique({
            where: { id: parentId },
            select: { id: true, courseId: true },
          });

          if (!parentModule) {
            return NextResponse.json<ApiResponse>(
              {
                success: false,
                error: {
                  code: "NOT_FOUND",
                  message: "Родительский модуль не найден",
                },
              },
              { status: 404 }
            );
          }

          if (parentModule.courseId !== courseId) {
            return NextResponse.json<ApiResponse>(
              {
                success: false,
                error: {
                  code: "INVALID_DATA",
                  message: "Родительский модуль принадлежит другому курсу",
                },
              },
              { status: 400 }
            );
          }
        }

        // Используем транзакцию для атомарного получения orderIndex и создания модуля
        const moduleData = await db.$transaction(async (tx) => {
          const lastModule = await tx.module.findFirst({
            where: { 
              courseId,
              parentId: parentId || null 
            },
            orderBy: { orderIndex: "desc" },
          });

          const orderIndex = lastModule ? lastModule.orderIndex + 1 : 0;

          return await tx.module.create({
            data: {
              courseId,
              title,
              parentId,
              orderIndex,
              allowedTariffs: allowedTariffs || [],
              allowedTracks: allowedTracks || [],
              allowedGroups: allowedGroups || [],
            },
          });
        });

        // Audit log
        await logAction(req.user!.userId, "CREATE_MODULE", "module", moduleData.id, {
          title: moduleData.title,
          courseId,
          access: {
            tariffs: allowedTariffs,
            tracks: allowedTracks,
            groups: allowedGroups,
          }
        });

        return NextResponse.json<ApiResponse>({ success: true, data: moduleData }, { status: 201 });
      } catch (error) {
        console.error("Create module error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Не удалось создать модуль",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}
