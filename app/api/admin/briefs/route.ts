import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";

export const dynamic = "force-dynamic";

// GET /api/admin/briefs?status=completed|in_progress|all
// Список брифов для админ-панели. По умолчанию — только completed.
export async function GET(request: NextRequest) {
  return withAuth(
    request,
    async () => {
      try {
        const url = new URL(request.url);
        const statusParam = url.searchParams.get("status") || "completed";
        const where =
          statusParam === "all"
            ? {}
            : { status: statusParam };

        const briefs = await db.brief.findMany({
          where,
          orderBy: [{ completedAt: "desc" }, { updatedAt: "desc" }],
          include: {
            user: {
              select: { id: true, email: true, fullName: true, avatarUrl: true },
            },
            _count: { select: { cases: true, files: true } },
          },
        });

        const formatted = briefs.map((b) => ({
          id: b.id,
          userId: b.userId,
          status: b.status,
          fio: b.fio,
          subject: b.subject,
          completedAt: b.completedAt,
          updatedAt: b.updatedAt,
          createdAt: b.createdAt,
          user: b.user,
          casesCount: b._count.cases,
          filesCount: b._count.files,
        }));

        return NextResponse.json<ApiResponse>(
          { success: true, data: formatted },
          { status: 200 }
        );
      } catch (error) {
        console.error("Admin list briefs error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: { code: "INTERNAL_ERROR", message: "Не удалось загрузить брифы" },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}
