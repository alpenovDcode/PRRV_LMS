import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { UserRole } from "@prisma/client";
import { ApiResponse } from "@/types";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  return withAuth(
    request,
    async (req) => {
      const me = req.user!;
      const question = await db.question.findUnique({ where: { id: params.id } });
      if (!question) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: { code: "NOT_FOUND", message: "Вопрос не найден" } },
          { status: 404 }
        );
      }
      if (question.curatorId && question.curatorId !== me.userId) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: { code: "CONFLICT", message: "Вопрос уже взят другим наставником" } },
          { status: 409 }
        );
      }
      const updated = await db.question.update({
        where: { id: question.id },
        data: {
          curatorId: me.userId,
          status: question.status === "open" ? "in_progress" : question.status,
        },
      });
      return NextResponse.json<ApiResponse>({ success: true, data: { question: updated } });
    },
    { roles: [UserRole.curator, UserRole.admin] }
  );
}
