import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { UserRole } from "@prisma/client";
import { ApiResponse } from "@/types";

export async function GET(request: NextRequest) {
  return withAuth(
    request,
    async () => {
      try {
        const logs = await db.auditLog.findMany({
          take: 50,
          orderBy: { createdAt: "desc" },
          include: {
            user: {
              select: {
                fullName: true,
                email: true,
              },
            },
          },
        });

        return NextResponse.json<ApiResponse>({
          success: true,
          data: logs,
        });
      } catch (error) {
        console.error("Audit logs error:", error);
        return NextResponse.json<ApiResponse>(
          { success: false, error: { code: "INTERNAL_ERROR", message: "Failed to fetch audit logs" } },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin] }
  );
}
