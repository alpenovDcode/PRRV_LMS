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
