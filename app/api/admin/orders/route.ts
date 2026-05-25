import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { UserRole } from "@prisma/client";
import { z } from "zod";

// Zod-схема для query params. Маппинг строки→число, ограничения на длину.
const querySchema = z.object({
  page: z
    .coerce.number()
    .int()
    .min(1)
    .max(10_000)
    .default(1),
  status: z
    .enum(["pending", "waiting_for_capture", "paid", "cancelled", "refunded"])
    .optional(),
  search: z.string().max(100).optional(),
});

/** GET /api/admin/orders?page=1&status=paid&search=email */
export async function GET(req: NextRequest) {
  return withAuth(
    req,
    async () => {
      const { searchParams } = new URL(req.url);
      const parsed = querySchema.safeParse({
        page: searchParams.get("page") ?? undefined,
        status: searchParams.get("status") ?? undefined,
        search: searchParams.get("search") ?? undefined,
      });
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, error: "Некорректные параметры запроса" },
          { status: 400 }
        );
      }
      const { page, status, search } = parsed.data;
      const limit = 50;

      const where: any = {};
      if (status) where.status = status;
      if (search) {
        where.user = {
          OR: [
            { email: { contains: search, mode: "insensitive" } },
            { fullName: { contains: search, mode: "insensitive" } },
          ],
        };
      }

      const [orders, total] = await Promise.all([
        db.order.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
          include: {
            user: { select: { id: true, email: true, fullName: true } },
            offer: { select: { id: true, title: true } },
          },
        }),
        db.order.count({ where }),
      ]);

      return NextResponse.json({
        success: true,
        data: orders,
        meta: { total, page, limit, pages: Math.ceil(total / limit) },
      });
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}
