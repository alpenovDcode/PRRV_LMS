import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { getErrorStats } from "@/lib/error-tracking";
import { z } from "zod";

const querySchema = z.object({
  days: z.coerce.number().min(1).max(90).optional(),
});

/**
 * GET /api/admin/errors/stats
 * Получение статистики ошибок
 */
export async function GET(request: NextRequest) {
  return withAuth(
    request,
    async (req) => {
      try {
        const { searchParams } = new URL(request.url);
        const { days } = querySchema.parse(Object.fromEntries(searchParams));

        const stats = await getErrorStats(days || 7);

        return NextResponse.json({
          success: true,
          stats,
        });
      } catch (error) {
        console.error("Error fetching error stats:", error);
        return NextResponse.json(
          {
            success: false,
            error: "Failed to fetch error stats",
          },
          { status: 500 }
        );
      }
    },
    { roles: ["admin"] }
  );
}
