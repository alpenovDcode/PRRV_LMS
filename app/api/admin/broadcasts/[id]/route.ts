import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { UserRole } from "@prisma/client";
import { ApiResponse } from "@/types";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return withAuth(
    request,
    async () => {
      const { id } = await context.params;
      const broadcast = await db.broadcast.findUnique({
        where: { id },
        include: {
          author: { select: { fullName: true, email: true } },
          recipientLogs: {
            orderBy: { createdAt: "asc" },
            include: {
              user: { select: { id: true, fullName: true, email: true, role: true } },
            },
          },
        },
      });
      if (!broadcast) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: { code: "NOT_FOUND", message: "Рассылка не найдена" } },
          { status: 404 }
        );
      }
      return NextResponse.json<ApiResponse>({ success: true, data: { broadcast } });
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}
