import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { UserRole } from "@prisma/client";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { z } from "zod";

const templateCreateSchema = z.object({
  courseId: z.string().uuid().optional().nullable(),
  name: z.string().min(1, "Название обязательно"),
  imageUrl: z.string().url("Некорректный URL изображения"),
  fieldConfig: z.object({
    fullName: z.object({
      x: z.number(),
      y: z.number(),
      fontSize: z.number(),
      fontFamily: z.string(),
      color: z.string(),
      align: z.enum(["left", "center", "right"]),
    }),
    courseName: z.object({
      x: z.number(),
      y: z.number(),
      fontSize: z.number(),
      fontFamily: z.string(),
      color: z.string(),
      align: z.enum(["left", "center", "right"]),
    }),
    date: z.object({
      x: z.number(),
      y: z.number(),
      fontSize: z.number(),
      fontFamily: z.string(),
      color: z.string(),
      align: z.enum(["left", "center", "right"]),
      format: z.enum(["DD.MM.YYYY", "DD MMMM YYYY", "MMMM DD, YYYY"]),
    }),
    certificateNumber: z.object({
      x: z.number(),
      y: z.number(),
      fontSize: z.number(),
      fontFamily: z.string(),
      color: z.string(),
      align: z.enum(["left", "center", "right"]),
    }),
  }),
});

const templateUpdateSchema = templateCreateSchema.partial();

// GET /api/admin/certificates/templates - List all templates
export async function GET(request: NextRequest) {
  return withAuth(
    request,
    async () => {
      try {
        const { searchParams } = new URL(request.url);
        const courseId = searchParams.get("courseId");

        const templates = await db.certificateTemplate.findMany({
          where: courseId ? { courseId } : {},
          include: {
            course: {
              select: {
                id: true,
                title: true,
              },
            },
            _count: {
              select: {
                certificates: true,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        });

        return NextResponse.json<ApiResponse>(
          {
            success: true,
            data: templates,
          },
          { status: 200 }
        );
      } catch (error) {
        console.error("Get templates error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "FETCH_ERROR",
              message: "Ошибка при получении шаблонов",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin] }
  );
}

// POST /api/admin/certificates/templates - Create template
export async function POST(request: NextRequest) {
  return withAuth(
    request,
    async () => {
      try {
        const body = await request.json();
        const data = templateCreateSchema.parse(body);

        // If courseId is provided, verify course exists
        if (data.courseId) {
          const course = await db.course.findUnique({
            where: { id: data.courseId },
          });

          if (!course) {
            return NextResponse.json<ApiResponse>(
              {
                success: false,
                error: {
                  code: "COURSE_NOT_FOUND",
                  message: "Курс не найден",
                },
              },
              { status: 404 }
            );
          }
        }

        const template = await db.certificateTemplate.create({
          data: {
            courseId: data.courseId || null,
            name: data.name,
            imageUrl: data.imageUrl,
            fieldConfig: data.fieldConfig,
          },
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

        console.error("Create template error:", error);
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
