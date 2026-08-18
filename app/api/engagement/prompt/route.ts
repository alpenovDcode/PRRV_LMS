import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { syncLearningEngagement } from "@/lib/learning-engagement";
import { ApiResponse } from "@/types";

export async function GET(request: NextRequest) {
  return withAuth(request, async (req) => {
    try {
      const prompt = await syncLearningEngagement(req.user!.userId);
      return NextResponse.json<ApiResponse>({ success: true, data: prompt });
    } catch (error) {
      console.error("Learning engagement sync failed:", error);
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: { code: "INTERNAL_ERROR", message: "Не удалось обновить рекомендации" },
        },
        { status: 500 }
      );
    }
  });
}
