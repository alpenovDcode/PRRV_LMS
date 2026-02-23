import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";
import { adminModuleUpdateSchema } from "@/lib/validations";
import { logAction } from "@/lib/audit";

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
        const { 
          title, 
          allowedTariffs, 
          allowedTracks, 
          allowedGroups, 
          openAt, 
          openAfterAmount, 
          openAfterUnit, 
          openAfterEvent 
        } = adminModuleUpdateSchema.parse(body);

        const updateData: any = {};
        if (title !== undefined) updateData.title = title;
        if (allowedTariffs !== undefined) updateData.allowedTariffs = allowedTariffs;
        if (allowedTracks !== undefined) updateData.allowedTracks = allowedTracks;
        if (allowedGroups !== undefined) updateData.allowedGroups = allowedGroups;
        if (openAt !== undefined) updateData.openAt = openAt;
        if (openAfterAmount !== undefined) updateData.openAfterAmount = openAfterAmount;
        if (openAfterUnit !== undefined) updateData.openAfterUnit = openAfterUnit;
        if (openAfterEvent !== undefined) updateData.openAfterEvent = openAfterEvent;
        if (body.trackSettings !== undefined) updateData.trackSettings = body.trackSettings;

        const moduleData = await db.module.update({
          where: { id },
          data: updateData,
        });

        // Audit log
        await logAction(req.user!.userId, "UPDATE_MODULE", "module", moduleData.id, {
          title: moduleData.title,
          allowedTariffs: moduleData.allowedTariffs,
          allowedTracks: moduleData.allowedTracks,
          allowedGroups: moduleData.allowedGroups,
        });

        return NextResponse.json<ApiResponse>({ success: true, data: moduleData }, { status: 200 });
      } catch (error) {
        console.error("Update module error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Не удалось обновить модуль",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin, UserRole.curator] }
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
        // Получаем информацию о модуле перед удалением для audit log
        const moduleData = await db.module.findUnique({
          where: { id },
          select: { id: true, title: true, courseId: true },
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

        await db.module.delete({
          where: { id },
        });

        // Audit log
        await logAction(req.user!.userId, "DELETE_MODULE", "module", moduleData.id, {
          title: moduleData.title,
          courseId: moduleData.courseId,
        });

        return NextResponse.json<ApiResponse>({ success: true }, { status: 200 });
      } catch (error) {
        console.error("Delete module error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Не удалось удалить модуль",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}
