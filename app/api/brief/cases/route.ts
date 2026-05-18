import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";

export const dynamic = "force-dynamic";

// POST /api/brief/cases — добавить новый (пустой) кейс к моему брифу.
// Возвращает созданный кейс. Поля заполняются последующими PATCH.
export async function POST(request: NextRequest) {
  return withAuth(request, async (req) => {
    try {
      const userId = req.user!.userId;

      let brief = await db.brief.findUnique({ where: { userId } });
      if (!brief) {
        brief = await db.brief.create({ data: { userId } });
      }
      if (brief.status === "completed") {
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: { code: "FORBIDDEN", message: "Бриф уже завершён" },
          },
          { status: 403 }
        );
      }

      const last = await db.briefCase.findFirst({
        where: { briefId: brief.id },
        orderBy: { orderIndex: "desc" },
      });
      const nextIndex = last ? last.orderIndex + 1 : 0;

      const created = await db.briefCase.create({
        data: { briefId: brief.id, orderIndex: nextIndex },
      });

      return NextResponse.json<ApiResponse>(
        { success: true, data: created },
        { status: 201 }
      );
    } catch (error) {
      console.error("Create brief case error:", error);
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: { code: "INTERNAL_ERROR", message: "Не удалось добавить кейс" },
        },
        { status: 500 }
      );
    }
  });
}
