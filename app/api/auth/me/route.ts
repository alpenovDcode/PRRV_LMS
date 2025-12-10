import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";

export async function GET(request: NextRequest) {
  return withAuth(request, async (req) => {
    try {
      const user = await db.user.findUnique({
        where: { id: req.user!.userId },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          avatarUrl: true,
          phone: true,
          about: true,
        },
      });

      if (!user) {
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "USER_NOT_FOUND",
              message: "Пользователь не найден",
            },
          },
          { status: 404 }
        );
      }

      return NextResponse.json<ApiResponse>(
        {
          success: true,
          data: user,
        },
        { status: 200 }
      );
    } catch (error) {
      console.error("Get user error:", error);
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Произошла ошибка при получении данных пользователя",
          },
        },
        { status: 500 }
      );
    }
  });
}

