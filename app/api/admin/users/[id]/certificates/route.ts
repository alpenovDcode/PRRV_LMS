import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { UserRole } from "@prisma/client";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";

// GET /api/admin/users/[id]/certificates - Get user's certificates (admin only)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    request,
    async () => {
      try {
        const { id: userId } = await params;

        const certificates = await db.certificate.findMany({
          where: { userId },
          include: {
            course: {
              select: {
                id: true,
                title: true,
                slug: true,
              },
            },
            template: {
              select: {
                id: true,
                name: true,
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
        console.error("Get user certificates error:", error);
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
    { roles: [UserRole.admin, UserRole.curator] }
  );
}
