import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { UserRole } from "@prisma/client";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    request,
    async () => {
      try {
        const { id: userId } = await params;

        const gcData = await db.getcourseData.findUnique({
          where: { userId },
          select: {
            data: true,
            importedAt: true,
          },
        });

        return NextResponse.json<ApiResponse>(
          {
            success: true,
            data: gcData
              ? { data: gcData.data, importedAt: gcData.importedAt }
              : { data: null, importedAt: null },
          },
          { status: 200 }
        );
      } catch (error) {
        console.error("Get getcourse data error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "FETCH_ERROR",
              message: "Ошибка при получении данных GetCourse",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}
