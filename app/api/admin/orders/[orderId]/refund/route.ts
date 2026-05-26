import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { refundOrder } from "@/lib/payments/refund-order";

const schema = z.object({
  /** Сумма возврата в рублях. Если undefined — полный. Должна быть > 0 и ≤ суммы заказа. */
  amount: z.number().positive().optional(),
  reason: z.string().min(1).max(500).optional(),
  /** Удалить Enrollment'ы по курсам из snapshot. По умолчанию true. */
  revokeAccess: z.boolean().default(true),
});

/**
 * POST /api/admin/orders/[orderId]/refund
 *
 * Только admin может инициировать возврат. Вызывает refundOrder() —
 * атомарный оркестратор с локом + вызовом провайдера + опциональным
 * отзывом доступа.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  return withAuth(
    req,
    async (authedReq) => {
      const { orderId } = await params;
      const body = await req.json().catch(() => ({}));
      const parsed = schema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, error: "Некорректные параметры" },
          { status: 400 }
        );
      }

      try {
        const result = await refundOrder({
          orderId,
          amount: parsed.data.amount,
          reason: parsed.data.reason,
          revokeAccess: parsed.data.revokeAccess,
          actorUserId: authedReq.user!.userId,
        });

        if (result.alreadyRefunded) {
          return NextResponse.json({
            success: true,
            alreadyRefunded: true,
            message: "Заказ уже возвращён",
          });
        }

        return NextResponse.json({
          success: true,
          data: {
            refundId: result.refundId,
            amount: result.amount,
            revokedCourseIds: result.revokedCourseIds,
          },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[refund] failed for order", orderId, ":", msg);
        return NextResponse.json(
          { success: false, error: msg },
          { status: 400 }
        );
      }
    },
    { roles: [UserRole.admin] }
  );
}
