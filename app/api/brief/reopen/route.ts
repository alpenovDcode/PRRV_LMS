import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { requireTariff, tariffDeniedResponse } from "@/lib/tariff-guard";

export const dynamic = "force-dynamic";

// POST /api/brief/reopen — открыть завершённый бриф снова в режим
// редактирования. Возвращает на финальный экран.
export async function POST(request: NextRequest) {
  return withAuth(request, async (req) => {
    try {
      const userId = req.user!.userId;
      const guard = await requireTariff(userId, ["LR"]);
      if (!guard.ok) return tariffDeniedResponse(guard);
      const brief = await db.brief.findUnique({ where: { userId } });
      if (!brief) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: { code: "NOT_FOUND", message: "Бриф не найден" } },
          { status: 404 }
        );
      }
      const updated = await db.brief.update({
        where: { userId },
        data: { status: "in_progress", currentStep: 7 },
      });
      return NextResponse.json<ApiResponse>(
        { success: true, data: updated },
        { status: 200 }
      );
    } catch (error) {
      console.error("Reopen brief error:", error);
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: { code: "INTERNAL_ERROR", message: "Не удалось открыть бриф" },
        },
        { status: 500 }
      );
    }
  });
}
