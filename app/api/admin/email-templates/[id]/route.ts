import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { UserRole } from "@prisma/client";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { z } from "zod";

const updateSchema = z.object({
  subject: z.string().min(1, "Тема должна быть заполнена"),
  body: z.string().min(1, "Тело письма должно быть заполнено"),
  isActive: z.boolean().optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    request,
    async () => {
      try {
        const { id } = await params;
        const template = await db.emailTemplate.findUnique({
          where: { id },
        });

        if (!template) {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: {
                code: "NOT_FOUND",
                message: "Шаблон не найден",
              },
            },
            { status: 404 }
          );
        }

        return NextResponse.json<ApiResponse>(
          {
            success: true,
            data: template,
          },
          { status: 200 }
        );
      } catch (error) {
        console.error("Get email template error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "FETCH_ERROR",
              message: "Ошибка при получении шаблона",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    request,
    async () => {
      try {
        const { id } = await params;
        const body = await request.json();
        const data = updateSchema.parse(body);

        // Get current template to know the event
        const currentTemplate = await db.emailTemplate.findUnique({
          where: { id },
          select: { event: true },
        });

        if (!currentTemplate) {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: { code: "NOT_FOUND", message: "Шаблон не найден" },
            },
            { status: 404 }
          );
        }

        // If activating, deactivate others
        if (data.isActive) {
          await db.emailTemplate.updateMany({
            where: {
              event: currentTemplate.event,
              id: { not: id },
            },
            data: { isActive: false },
          });
        }

        const template = await db.emailTemplate.update({
          where: { id },
          data: {
            subject: data.subject,
            body: data.body,
            isActive: data.isActive,
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

        console.error("Update email template error:", error);
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
    { roles: [UserRole.admin, UserRole.curator] }
  );
}
