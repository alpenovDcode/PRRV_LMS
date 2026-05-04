import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { UserRole } from "@prisma/client";
import { ApiResponse } from "@/types";
import { createNotification } from "@/lib/notifications";

// GET /api/questions — list current user's questions (student)
export async function GET(request: NextRequest) {
  return withAuth(request, async (req) => {
    const userId = req.user!.userId;
    const items = await db.question.findMany({
      where: { studentId: userId },
      orderBy: { updatedAt: "desc" },
      include: {
        curator: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
        _count: { select: { messages: true } },
      },
    });
    return NextResponse.json<ApiResponse>({ success: true, data: { items } });
  });
}

// POST /api/questions — create new question (student)
export async function POST(request: NextRequest) {
  return withAuth(request, async (req) => {
    try {
      const body = await request.json();
      const { subject, content, lessonId } = body;
      if (!subject || !content) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: { code: "BAD_REQUEST", message: "Тема и текст обязательны" } },
          { status: 400 }
        );
      }
      const userId = req.user!.userId;

      const question = await db.question.create({
        data: {
          studentId: userId,
          subject,
          lessonId: lessonId || null,
          status: "open",
          messages: {
            create: { authorId: userId, content },
          },
        },
        include: { messages: true },
      });

      // Notify all curators + admins about new question
      const curators = await db.user.findMany({
        where: { role: { in: [UserRole.curator, UserRole.admin] }, isBlocked: false },
        select: { id: true },
      });
      const student = await db.user.findUnique({ where: { id: userId }, select: { fullName: true, email: true } });
      const studentName = student?.fullName || student?.email || "Студент";
      await Promise.allSettled(
        curators.map((c) =>
          createNotification(
            c.id,
            "new_question",
            "Новый вопрос наставнику",
            `${studentName}: ${subject}`,
            `/curator/questions/${question.id}`
          )
        )
      );

      return NextResponse.json<ApiResponse>({ success: true, data: { question } });
    } catch (error) {
      console.error("Create question error:", error);
      return NextResponse.json<ApiResponse>(
        { success: false, error: { code: "INTERNAL_ERROR", message: "Не удалось создать вопрос" } },
        { status: 500 }
      );
    }
  });
}
