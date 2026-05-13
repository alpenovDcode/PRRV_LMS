import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-middleware";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Minimal list of flows for the funnel page selector. We expose only
// the fields needed in the UI to keep the payload small.
export async function GET(
  request: NextRequest,
  { params: paramsP }: { params: Promise<{ botId: string }> }
) {
  const params = await paramsP;
  return withAuth(
    request,
    async () => {
      const flows = await db.tgFlow.findMany({
        where: { botId: params.botId },
        select: {
          id: true,
          name: true,
          isActive: true,
          totalEntered: true,
          totalCompleted: true,
        },
        orderBy: { updatedAt: "desc" },
      });
      return NextResponse.json(
        { success: true, data: { flows } },
        { headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=60" } }
      );
    },
    { roles: ["admin"] }
  );
}
