import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { UserRole } from "@prisma/client";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { z } from "zod";

const createTemplateSchema = z.object({
  name: z.string().min(1, "Название обязательно"),
  event: z.string().min(1, "Событие обязательно"),
  subject: z.string().min(1, "Тема обязательна"),
  body: z.string().min(1, "Тело письма обязательно"),
  isActive: z.boolean().optional(),
  variables: z.any().optional(),
});

export async function GET(request: NextRequest) {
  return withAuth(
    request,
    async () => {
      try {
        const templates = await db.emailTemplate.findMany({
          orderBy: { createdAt: "desc" },
        });

        return NextResponse.json<ApiResponse>(
          {
            success: true,
            data: templates,
          },
          { status: 200 }
        );
      } catch (error) {
        console.error("Get email templates error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "FETCH_ERROR",
              message: "Ошибка при получении шаблонов писем",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin] }
  );
}

export async function POST(request: NextRequest) {
  return withAuth(
    request,
    async () => {
      try {
        const body = await request.json();
        const data = createTemplateSchema.parse(body);

        // If setting to active, deactivate others for this event
        if (data.isActive) {
          await db.emailTemplate.updateMany({
            where: { event: data.event },
            data: { isActive: false },
          });
        }

        const template = await db.emailTemplate.create({
          data: {
            name: data.name,
            event: data.event,
            subject: data.subject,
            body: data.body,
            isActive: data.isActive ?? false,
            variables: data.variables || {},
          },
        });

        return NextResponse.json<ApiResponse>(
          {
            success: true,
            data: template,
          },
          { status: 201 }
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
        console.error("Create email template error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "CREATE_ERROR",
              message: "Ошибка при создании шаблона",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin] }
  );
}
