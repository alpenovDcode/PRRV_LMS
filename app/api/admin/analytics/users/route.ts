import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";
import { subDays, format, startOfDay, subMonths } from "date-fns";

export async function GET(request: NextRequest) {
  return withAuth(
    request,
    async () => {
      try {
        const { searchParams } = new URL(request.url);
        const range = searchParams.get("range") || "30d"; // 7d, 30d, 90d, all

        let startDate = subDays(new Date(), 30);
        if (range === "7d") startDate = subDays(new Date(), 7);
        if (range === "90d") startDate = subDays(new Date(), 90);
        if (range === "all") startDate = subMonths(new Date(), 12); // Limit "all" to 1 year for chart readability

        const users = await db.user.findMany({
          where: {
            createdAt: {
              gte: startDate,
            },
          },
          select: {
            createdAt: true,
          },
          orderBy: {
            createdAt: "asc",
          },
        });

        // Group by date
        const groupedData: Record<string, number> = {};
        
        // Initialize all dates in range with 0 to have a continuous line
        // (Simplified: just grouping existing data for now, frontend can handle gaps or we can improve later)
        
        users.forEach((user) => {
          const date = format(user.createdAt, "yyyy-MM-dd");
          groupedData[date] = (groupedData[date] || 0) + 1;
        });

        const chartData = Object.entries(groupedData).map(([date, count]) => ({
          date,
          count,
        }));

        return NextResponse.json<ApiResponse>({ success: true, data: chartData }, { status: 200 });
      } catch (error) {
        console.error("Analytics users error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Не удалось получить данные о пользователях",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}
