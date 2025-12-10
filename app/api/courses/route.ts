import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";

export async function GET(request: Request) {
  return withAuth(request as any, async () => {
    try {
      const courses = await db.course.findMany({
        where: {
          isPublished: true,
        },
        select: {
          id: true,
          title: true,
          slug: true,
          description: true,
          coverImage: true,
          isPublished: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      return NextResponse.json<ApiResponse>(
        {
          success: true,
          data: courses,
        },
        { status: 200 }
      );
    } catch (error) {
      console.error("Get courses error:", error);
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Произошла ошибка при получении курсов",
          },
        },
        { status: 500 }
      );
    }
  });
}

