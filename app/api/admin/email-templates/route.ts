import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { UserRole } from "@prisma/client";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";

export async function GET(request: NextRequest) {
  return withAuth(
    request,
    async () => {
      try {
        const templates = await db.emailTemplate.findMany({
          orderBy: { createdAt: "desc" },
        });

        return NextResponse.json<ApiResponse>(
          {
            success: true,
            data: templates,
          },
          { status: 200 }
        );
      } catch (error) {
        console.error("Get email templates error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "FETCH_ERROR",
              message: "Ошибка при получении шаблонов писем",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin] }
  );
}
