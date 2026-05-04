import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { UserRole } from "@prisma/client";
import { ApiResponse } from "@/types";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  return withAuth(request, async (req) => {
    const me = req.user!;
    const question = await db.question.findUnique({
      where: { id: params.id },
      include: {
        student: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
        curator: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
        messages: {
          orderBy: { createdAt: "asc" },
          include: { author: { select: { id: true, fullName: true, email: true, avatarUrl: true, role: true } } },
        },
      },
    });
    if (!question) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: { code: "NOT_FOUND", message: "Вопрос не найден" } },
        { status: 404 }
      );
    }
    // Access: student-author, curator/admin
    if (me.role === UserRole.student && question.studentId !== me.userId) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: { code: "FORBIDDEN", message: "Нет доступа" } },
        { status: 403 }
      );
    }

    // Mark messages from the other side as read
    await db.questionMessage.updateMany({
      where: {
        questionId: question.id,
        authorId: { not: me.userId },
        readAt: null,
      },
      data: { readAt: new Date() },
    });

    return NextResponse.json<ApiResponse>({ success: true, data: { question } });
  });
}
