import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { UserRole } from "@prisma/client";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";

// GET /api/admin/certificates - List all certificates
export async function GET(request: NextRequest) {
  return withAuth(
    request,
    async () => {
      try {
        const certificates = await db.certificate.findMany({
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                email: true,
              },
            },
            course: {
              select: {
                id: true,
                title: true,
              },
            },
          },
          orderBy: {
            issuedAt: "desc",
          },
        });

        return NextResponse.json<ApiResponse>(
          {
            success: true,
            data: certificates,
          },
          { status: 200 }
        );
      } catch (error) {
        console.error("Get certificates error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "FETCH_ERROR",
              message: "Ошибка при получении сертификатов",
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
    async (req) => {
      try {
        const body = await request.json();
        const { userId, courseId, templateId } = body;

        if (!userId || !courseId || !templateId) {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: {
                code: "VALIDATION_ERROR",
                message: "Необходимо указать пользователя, курс и шаблон",
              },
            },
            { status: 400 }
          );
        }

        // Dynamically import to avoid circular dep if any, though likely safe
        const { generateCertificate } = await import("@/lib/certificate-service");

        const { certificate, logs } = await generateCertificate({
          userId,
          courseId,
          templateId,
        });

        return NextResponse.json(
          {
            success: true,
            data: certificate,
            logs
          },
          { status: 201 }
        );
      } catch (error: any) {
        console.error("Issue certificate error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "ISSUANCE_ERROR",
              message: error.message || "Ошибка при выдаче сертификата",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}
