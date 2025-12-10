import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { updateErrorStatus } from "@/lib/error-tracking";
import { z } from "zod";

const updateSchema = z.object({
  status: z.enum(["new", "investigating", "resolved", "ignored"]),
  notes: z.string().optional(),
});

/**
 * GET /api/admin/errors/[id]
 * Получение детальной информации об ошибке
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    request,
    async (req) => {
      try {
        const { id } = await params;
        // Пробуем найти как группу
        let error = await db.errorGroup.findUnique({
          where: { id },
          include: {
            errors: {
              take: 10,
              orderBy: { createdAt: "desc" },
              include: {
                user: {
                  select: {
                    id: true,
                    email: true,
                    fullName: true,
                  },
                },
              },
            },
          },
        });

        if (error) {
          return NextResponse.json({
            success: true,
            type: "group",
            error,
          });
        }

        // Если не группа, ищем как отдельную ошибку
        const singleError = await db.errorLog.findUnique({
          where: { id },
          include: {
            group: true,
            user: {
              select: {
                id: true,
                email: true,
                fullName: true,
              },
            },
          },
        });

        if (!singleError) {
          return NextResponse.json(
            { success: false, error: "Error not found" },
            { status: 404 }
          );
        }

        return NextResponse.json({
          success: true,
          type: "single",
          error: singleError,
        });
      } catch (error) {
        console.error("Error fetching error details:", error);
        return NextResponse.json(
          {
            success: false,
            error: "Failed to fetch error details",
          },
          { status: 500 }
        );
      }
    },
    { roles: ["admin"] }
  );
}

/**
 * PATCH /api/admin/errors/[id]
 * Обновление статуса ошибки
 */
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
        const { status, notes } = updateSchema.parse(body);

        const updated = await updateErrorStatus(
          id,
          status,
          req.user?.userId,
          notes
        );

        return NextResponse.json({
          success: true,
          error: updated,
        });
      } catch (error) {
        console.error("Error updating error status:", error);
        return NextResponse.json(
          {
            success: false,
            error: "Failed to update error status",
          },
          { status: 500 }
        );
      }
    },
    { roles: ["admin"] }
  );
}

/**
 * DELETE /api/admin/errors/[id]
 * Удаление ошибки или группы
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    request,
    async (req) => {
      try {
        const { id } = await params;
        // Пробуем удалить как группу
        try {
          await db.errorGroup.delete({
            where: { id },
          });
        } catch {
          // Если не группа, удаляем как отдельную ошибку
          await db.errorLog.delete({
            where: { id },
          });
        }

        return NextResponse.json({
          success: true,
        });
      } catch (error) {
        console.error("Error deleting error:", error);
        return NextResponse.json(
          {
            success: false,
            error: "Failed to delete error",
          },
          { status: 500 }
        );
      }
    },
    { roles: ["admin"] }
  );
}
