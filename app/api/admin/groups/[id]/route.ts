import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";
import { adminGroupCreateSchema } from "@/lib/validations";
import { logAction } from "@/lib/audit";
import { z } from "zod";

const updateGroupSchema = adminGroupCreateSchema.partial();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    request,
    async () => {
        const { id } = await params;
      try {
        const group = await db.group.findUnique({
          where: { id },
          include: {
            _count: {
              select: { members: true },
            },
            members: {
              include: {
                user: {
                  select: {
                    id: true,
                    email: true,
                    fullName: true,
                    role: true,
                  },
                },
              },
              take: 10, // Первые 10 для предпросмотра
            },
          },
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

        return NextResponse.json<ApiResponse>({ success: true, data: group }, { status: 200 });
      } catch (error) {
        console.error("Get group error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Не удалось получить группу",
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
        const parsed = updateGroupSchema.parse(body);

        // Проверяем существование группы
        const existingGroup = await db.group.findUnique({
          where: { id },
        });

        if (!existingGroup) {
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

        const group = await db.group.update({
          where: { id },
          data: {
            name: parsed.name,
            description: parsed.description,
          },
        });

        // Audit log
        await logAction(req.user!.userId, "UPDATE_GROUP", "group", group.id, {
          name: group.name,
        });

        return NextResponse.json<ApiResponse>({ success: true, data: group }, { status: 200 });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: {
                code: "VALIDATION_ERROR",
                message: "Некорректные данные группы",
              },
            },
            { status: 400 }
          );
        }

        console.error("Update group error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Не удалось обновить группу",
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
        // Получаем информацию о группе перед удалением для audit log
        const group = await db.group.findUnique({
          where: { id },
          select: { id: true, name: true, _count: { select: { members: true } } },
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

        // Проверяем, есть ли участники
        if (group._count.members > 0) {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: {
                code: "HAS_MEMBERS",
                message: "Невозможно удалить группу с участниками. Сначала удалите всех участников.",
              },
            },
            { status: 400 }
          );
        }

        await db.group.delete({
          where: { id },
        });

        // Audit log
        await logAction(req.user!.userId, "DELETE_GROUP", "group", group.id, {
          name: group.name,
        });

        return NextResponse.json<ApiResponse>({ success: true }, { status: 200 });
      } catch (error) {
        console.error("Delete group error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Не удалось удалить группу",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin] }
  );
}

