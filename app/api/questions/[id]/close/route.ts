import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { UserRole } from "@prisma/client";
import { ApiResponse } from "@/types";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return withAuth(request, async (req) => {
    const me = req.user!;
    const { id } = await context.params;
    const question = await db.question.findUnique({ where: { id } });
    if (!question) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: { code: "NOT_FOUND", message: "Вопрос не найден" } },
        { status: 404 }
      );
    }
    const isOwner = question.studentId === me.userId;
    const isStaff = me.role === UserRole.curator || me.role === UserRole.admin;
    if (!isOwner && !isStaff) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: { code: "FORBIDDEN", message: "Нет доступа" } },
        { status: 403 }
      );
    }
    const updated = await db.question.update({
      where: { id },
      data: { status: "closed", closedAt: new Date() },
    });
    return NextResponse.json<ApiResponse>({ success: true, data: { question: updated } });
  });
}
