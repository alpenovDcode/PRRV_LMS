import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { UserRole, QuestionStatus, Prisma } from "@prisma/client";
import { ApiResponse } from "@/types";

// GET /api/curator/questions?filter=mine|open|all&status=...&search=...
export async function GET(request: NextRequest) {
  return withAuth(
    request,
    async (req) => {
      const url = new URL(request.url);
      const filter = url.searchParams.get("filter") || "all"; // mine, open, all
      const statusParam = url.searchParams.get("status");
      const search = url.searchParams.get("search")?.trim();

      const where: Prisma.QuestionWhereInput = {};

      if (filter === "mine") {
        where.curatorId = req.user!.userId;
      } else if (filter === "open") {
        where.status = "open";
      }

      if (statusParam && ["open", "in_progress", "answered", "closed"].includes(statusParam)) {
        where.status = statusParam as QuestionStatus;
      }

      if (search) {
        where.OR = [
          { subject: { contains: search, mode: "insensitive" } },
          { student: { fullName: { contains: search, mode: "insensitive" } } },
          { student: { email: { contains: search, mode: "insensitive" } } },
        ];
      }

      const items = await db.question.findMany({
        where,
        orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
        take: 200,
        include: {
          student: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
          curator: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { content: true, createdAt: true, authorId: true, readAt: true },
          },
          _count: { select: { messages: true } },
        },
      });

      return NextResponse.json<ApiResponse>({ success: true, data: { items } });
    },
    { roles: [UserRole.curator, UserRole.admin] }
  );
}
