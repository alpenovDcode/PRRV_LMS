import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { UserRole } from "@prisma/client";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    request,
    async () => {
      try {
        const { id: userId } = await params;

        const orders = await db.getcourseOrder.findMany({
          where: { userId },
          orderBy: { gcCreatedAt: "desc" },
          select: {
            id: true,
            gcOrderId: true,
            gcNumber: true,
            customerName: true,
            email: true,
            composition: true,
            status: true,
            amount: true,
            amountPaid: true,
            currency: true,
            paymentMethod: true,
            gcCreatedAt: true,
            gcPaidAt: true,
            data: true,
          },
        });

        return NextResponse.json<ApiResponse>(
          { success: true, data: orders },
          { status: 200 }
        );
      } catch (error) {
        console.error("Get getcourse orders error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: { code: "FETCH_ERROR", message: "Ошибка при получении заказов GetCourse" },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}
