import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";

export async function GET(request: NextRequest) {
  return withAuth(
    request,
    async () => {
      try {
        // Get counts of homework submissions by status
        const homeworkStats = await db.homeworkSubmission.groupBy({
          by: ["status"],
          _count: {
            id: true,
          },
        });

        // Format for Recharts (Pie Chart)
        const data = homeworkStats.map((stat) => ({
          name: stat.status,
          value: stat._count.id,
        }));

        // Translate status names for UI
        const translatedData = data.map(item => {
          let name: string = item.name;
          if (item.name === 'pending') name = 'На проверке';
          if (item.name === 'approved') name = 'Принято';
          if (item.name === 'rejected') name = 'Отклонено';
          return { ...item, name };
        });

        return NextResponse.json<ApiResponse>({ success: true, data: translatedData }, { status: 200 });
      } catch (error) {
        console.error("Analytics homework error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Не удалось получить статистику по ДЗ",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}
