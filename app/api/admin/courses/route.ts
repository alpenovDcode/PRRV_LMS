import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";
import { courseSchema } from "@/lib/validations";
import { slugify } from "@/lib/utils";
import { logAction } from "@/lib/audit";
import { validateOrigin } from "@/lib/csrf";

export async function GET(request: NextRequest) {
  return withAuth(
    request,
    async () => {
      try {
        const courses = await db.course.findMany({
          select: {
            id: true,
            title: true,
            slug: true,
            isPublished: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
        });

        return NextResponse.json<ApiResponse>({ success: true, data: courses }, { status: 200 });
      } catch (error) {
        console.error("Admin courses error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Не удалось получить список курсов",
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
        const body = await request.json();
        const parsed = courseSchema.parse(body);

        const slug = parsed.slug || slugify(parsed.title);

        // Sanitize description if provided
        let sanitizedDescription = parsed.description;
        if (parsed.description) {
          const { sanitizeHtml } = await import("@/lib/content-sanitization");
          sanitizedDescription = sanitizeHtml(parsed.description, "richText");
        }

        const course = await db.course.create({
          data: {
            title: parsed.title,
            slug,
            description: sanitizedDescription,
            coverImage: parsed.coverImage,
            isPublished: parsed.isPublished ?? false,
            authorId: req.user!.userId,
          },
        });

        // Audit log
        await logAction(req.user!.userId, "CREATE_COURSE", "course", course.id, {
          title: course.title,
          slug: course.slug,
        });

        return NextResponse.json<ApiResponse>(
          {
            success: true,
            data: course,
          },
          { status: 201 }
        );
      } catch (error: any) {
        if (error.name === "ZodError") {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: {
                code: "VALIDATION_ERROR",
                message: "Некорректные данные курса",
                details: error.errors,
              },
            },
            { status: 400 }
          );
        }

        console.error("Create course error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Не удалось создать курс",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin] }
  );
}

