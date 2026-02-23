import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";
import { courseSchema } from "@/lib/validations";
import { logAction } from "@/lib/audit";
import { validateOrigin } from "@/lib/csrf";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    request,
    async (req) => {
      try {
        const { id } = await params;
        const course = await db.course.findUnique({
          where: { id },
          include: {
            modules: {
              include: {
                lessons: true,
              },
              orderBy: { orderIndex: "asc" },
            },
          },
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

        return NextResponse.json<ApiResponse>({ success: true, data: course }, { status: 200 });
      } catch (error) {
        console.error("Get course error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Не удалось получить курс",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // CSRF защита
  if (!validateOrigin(request)) {
    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error: {
          code: "CSRF_ERROR",
          message: "Запрос отклонен из соображений безопасности",
        },
      },
      { status: 403 }
    );
  }

  return withAuth(
    request,
    async (req) => {
        const { id } = await params;
      try {
        const body = await request.json();
        
        // Валидация через Zod (частичное обновление)
        const updateSchema = courseSchema.partial();
        const parsed = updateSchema.parse(body);

        // Проверяем существование курса
        const existingCourse = await db.course.findUnique({
          where: { id },
        });

        if (!existingCourse) {
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

        // Sanitize description if provided
        let sanitizedDescription = parsed.description;
        if (parsed.description) {
          const { sanitizeHtml } = await import("@/lib/content-sanitization");
          sanitizedDescription = sanitizeHtml(parsed.description, "richText");
        }

        const course = await db.course.update({
          where: { id },
          data: {
            title: parsed.title,
            description: sanitizedDescription,
            isPublished: parsed.isPublished,
            coverImage: parsed.coverImage,
            autoIssueCertificate: parsed.autoIssueCertificate,
            certificateTemplateId: parsed.certificateTemplateId,
          },
        });

        // Audit log
        await logAction(req.user!.userId, "UPDATE_COURSE", "course", course.id, {
          title: parsed.title,
          isPublished: parsed.isPublished,
        });

        return NextResponse.json<ApiResponse>({ success: true, data: course }, { status: 200 });
      } catch (error) {
        console.error("Update course error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Не удалось обновить курс",
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
  // CSRF защита
  if (!validateOrigin(request)) {
    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error: {
          code: "CSRF_ERROR",
          message: "Запрос отклонен из соображений безопасности",
        },
      },
      { status: 403 }
    );
  }

  return withAuth(
    request,
    async (req) => {
      try {
        const { id } = await params;
        
        const course = await db.course.findUnique({
          where: { id },
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

        // Удаляем курс (каскадное удаление настроено в схеме Prisma)
        await db.course.delete({
          where: { id },
        });

        // Audit log
        await logAction(req.user!.userId, "DELETE_COURSE", "course", id, {
          title: course.title,
        });

        return NextResponse.json<ApiResponse>({
          success: true,
          data: { message: "Курс успешно удален" },
        });
      } catch (error) {
        console.error("Delete course error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Не удалось удалить курс",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}
