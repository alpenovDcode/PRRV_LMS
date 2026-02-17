import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { UserRole } from "@prisma/client";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { z } from "zod";

const templateUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  imageUrl: z.string().url().optional(),
  fieldConfig: z.any().optional(),
  isActive: z.boolean().optional(),
});

// PATCH /api/admin/certificates/templates/[id] - Update template
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return withAuth(
    request,
    async () => {
      try {
        const { id } = params;
        const body = await request.json();
        const data = templateUpdateSchema.parse(body);

        const template = await db.certificateTemplate.update({
          where: { id },
          data,
          include: {
            course: {
              select: {
                id: true,
                title: true,
              },
            },
          },
        });

        return NextResponse.json<ApiResponse>(
          {
            success: true,
            data: template,
          },
          { status: 200 }
        );
      } catch (error) {
        if (error instanceof z.ZodError) {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: {
                code: "VALIDATION_ERROR",
                message: error.errors[0]?.message || "Некорректные данные",
              },
            },
            { status: 400 }
          );
        }

        console.error("Update template error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "UPDATE_ERROR",
              message: "Ошибка при обновлении шаблона",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin] }
  );
}

// DELETE /api/admin/certificates/templates/[id] - Delete template
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return withAuth(
    request,
    async () => {
      try {
        const { id } = params;

        // Check if template has issued certificates
        const certificateCount = await db.certificate.count({
          where: { templateId: id },
        });

        if (certificateCount > 0) {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: {
                code: "TEMPLATE_IN_USE",
                message: `Невозможно удалить шаблон. По нему выдано ${certificateCount} сертификатов.`,
              },
            },
            { status: 400 }
          );
        }

        await db.certificateTemplate.delete({
          where: { id },
        });

        return NextResponse.json<ApiResponse>(
          {
            success: true,
            data: { message: "Шаблон удален" },
          },
          { status: 200 }
        );
      } catch (error) {
        console.error("Delete template error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "DELETE_ERROR",
              message: "Ошибка при удалении шаблона",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin] }
  );
}
