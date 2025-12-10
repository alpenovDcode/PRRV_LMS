import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { getErrors, getErrorGroups } from "@/lib/error-tracking";
import { z } from "zod";

const querySchema = z.object({
  severity: z.enum(["critical", "error", "warning", "info"]).optional(),
  status: z.enum(["new", "investigating", "resolved", "ignored"]).optional(),
  userId: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).optional(),
  offset: z.coerce.number().min(0).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  groupBy: z.enum(["none", "fingerprint"]).optional(),
});

/**
 * GET /api/admin/errors
 * Получение списка ошибок (только для админов)
 */
export async function GET(request: NextRequest) {
  return withAuth(
    request,
    async (req) => {
      try {
        const { searchParams } = new URL(request.url);
        const params = querySchema.parse(Object.fromEntries(searchParams));

        const groupBy = params.groupBy || "none";
        delete (params as any).groupBy;

        let result;
        if (groupBy === "fingerprint") {
          result = await getErrorGroups(params);
        } else {
          result = await getErrors(params);
        }

        return NextResponse.json({
          success: true,
          ...result,
        });
      } catch (error) {
        console.error("Error fetching errors:", error);
        return NextResponse.json(
          {
            success: false,
            error: "Failed to fetch errors",
          },
          { status: 500 }
        );
      }
    },
    { roles: ["admin"] }
  );
}
