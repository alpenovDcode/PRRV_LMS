import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";

// GET /api/student/certificates - Get user's certificates
export async function GET(request: NextRequest) {
  return withAuth(request, async (req) => {
    try {
      const userId = req.user.userId;

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
  });
}
