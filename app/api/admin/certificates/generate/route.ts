import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { UserRole } from "@prisma/client";
import { generateCertificate } from "@/lib/certificate-service";
import { ApiResponse } from "@/types";
import { z } from "zod";

const generateSchema = z.object({
  userId: z.string().uuid(),
  courseId: z.string().uuid(),
  templateId: z.string().uuid(),
});

// POST /api/admin/certificates/generate - Generate certificate
export async function POST(request: NextRequest) {
  return withAuth(
    request,
    async () => {
      try {
        const body = await request.json();
        const data = generateSchema.parse(body);

        const { certificate, logs } = await generateCertificate(data);

        return NextResponse.json(
          {
            success: true,
            data: certificate,
            logs // Adding logs to response
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

        console.error("Generate certificate error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "GENERATION_ERROR",
              message: error instanceof Error ? error.message : "Ошибка при генерации сертификата",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin] }
  );
}
