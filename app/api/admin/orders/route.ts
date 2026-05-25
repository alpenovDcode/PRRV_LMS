import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { UserRole } from "@prisma/client";

/** GET /api/admin/orders?page=1&status=paid&search=email */
export async function GET(req: NextRequest) {
  return withAuth(req, async () => {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
    const limit = 50;
    const status = searchParams.get("status") as any | null;
    const search = searchParams.get("search") ?? "";

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
  }, { roles: [UserRole.admin, UserRole.curator] });
}
