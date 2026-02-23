import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";
import { z } from "zod";

const updateEnrollmentSchema = z.object({
  expiresAt: z.string().nullable().optional(), // ISO Date string or null
  restrictedModules: z.array(z.string()).optional(),
  restrictedLessons: z.array(z.string()).optional(),
  status: z.enum(["active", "expired", "frozen"]).optional(),
});

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
        
        const validatedData = updateEnrollmentSchema.parse(body);

        const existingEnrollment = await db.enrollment.findUnique({
          where: { id },
        });

        if (!existingEnrollment) {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: {
                code: "NOT_FOUND",
                message: "Запись о курсе не найдена",
              },
            },
            { status: 404 }
          );
        }

        const updateData: any = {};
        if (validatedData.expiresAt !== undefined) {
          updateData.expiresAt = validatedData.expiresAt ? new Date(validatedData.expiresAt) : null;
        }
        if (validatedData.restrictedModules !== undefined) {
          updateData.restrictedModules = validatedData.restrictedModules;
        }
        if (validatedData.restrictedLessons !== undefined) {
          updateData.restrictedLessons = validatedData.restrictedLessons;
        }
        if (validatedData.status !== undefined) {
            updateData.status = validatedData.status;
        }

        const updatedEnrollment = await db.enrollment.update({
          where: { id },
          data: updateData,
        });

        return NextResponse.json<ApiResponse>(
          {
            success: true,
            data: updatedEnrollment,
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
                message: error.errors[0].message,
              },
            },
            { status: 400 }
          );
        }

        console.error("Update enrollment error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Не удалось обновить доступ к курсу",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}
