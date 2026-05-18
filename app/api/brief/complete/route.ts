import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { createNotification } from "@/lib/notifications";
import { UserRole } from "@prisma/client";

export const dynamic = "force-dynamic";

// POST /api/brief/complete — пользователь завершает заполнение брифа.
// Помечаем как completed, проставляем дату, рассылаем уведомления всем
// admin/curator (как в боте — block_completion + final notification).
export async function POST(request: NextRequest) {
  return withAuth(request, async (req) => {
    try {
      const userId = req.user!.userId;

      const brief = await db.brief.findUnique({
        where: { userId },
        include: { user: { select: { fullName: true, email: true } } },
      });

      if (!brief) {
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: { code: "NOT_FOUND", message: "Бриф не найден" },
          },
          { status: 404 }
        );
      }

      const updated = await db.brief.update({
        where: { userId },
        data: {
          status: "completed",
          completedAt: new Date(),
          currentStep: 7,
        },
      });

      // Уведомление администраторам и кураторам.
      const reviewers = await db.user.findMany({
        where: { role: { in: [UserRole.admin, UserRole.curator] } },
        select: { id: true },
      });
      const displayName = brief.user.fullName || brief.user.email;
      await Promise.all(
        reviewers.map((r) =>
          createNotification(
            r.id,
            "brief_completed",
            "Заполнен бриф",
            `Ученик ${displayName} заполнил бриф для визуальной упаковки.`,
            `/admin/briefs/${brief.id}`
          )
        )
      );

      return NextResponse.json<ApiResponse>(
        { success: true, data: updated },
        { status: 200 }
      );
    } catch (error) {
      console.error("Complete brief error:", error);
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: { code: "INTERNAL_ERROR", message: "Не удалось завершить бриф" },
        },
        { status: 500 }
      );
    }
  });
}
