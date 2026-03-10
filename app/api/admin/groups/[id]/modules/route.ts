import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";
import { logAction } from "@/lib/audit";
import { z } from "zod";

const groupModuleAccessSchema = z.object({
  moduleId: z.string().uuid(),
  action: z.enum(["grant", "revoke"]),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    request,
    async (req) => {
      try {
        const { id } = await params;
        const body = await request.json();
        const { moduleId, action } = groupModuleAccessSchema.parse(body);

        // Проверяем существование группы
        const group = await db.group.findUnique({
          where: { id },
          select: { id: true, name: true },
        });

        if (!group) {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: {
                code: "NOT_FOUND",
                message: "Группа не найдена",
              },
            },
            { status: 404 }
          );
        }

        // Получаем информацию о модуле
        const moduleData = await db.module.findUnique({
          where: { id: moduleId },
          select: { id: true, title: true, courseId: true, allowedGroups: true },
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

        let newAllowedGroups = [...(moduleData.allowedGroups || [])];

        if (action === "grant") {
          if (!newAllowedGroups.includes(id)) {
            newAllowedGroups.push(id);
          }
        } else if (action === "revoke") {
          newAllowedGroups = newAllowedGroups.filter(groupId => groupId !== id);
        }

        // Обновляем список групп модуля
        await db.module.update({
          where: { id: moduleId },
          data: {
            allowedGroups: newAllowedGroups,
          },
        });

        // Audit log
        await logAction(
          req.user!.userId,
          action === "grant" ? "GRANT_GROUP_MODULE_ACCESS" : "REVOKE_GROUP_MODULE_ACCESS",
          "module",
          moduleId,
          {
            groupId: id,
            groupName: group.name,
            moduleTitle: moduleData.title,
            courseId: moduleData.courseId,
          }
        );

        return NextResponse.json<ApiResponse>(
          {
            success: true,
            data: {
              moduleId,
              action,
              allowedGroups: newAllowedGroups,
            },
          },
          { status: 200 }
        );
      } catch (error) {
        console.error("Group module access error:", error);
        
        if (error instanceof z.ZodError) {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: {
                code: "VALIDATION_ERROR",
                message: "Некорректные данные",
              },
            },
            { status: 400 }
          );
        }

        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Не удалось изменить доступ к модулю",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}
