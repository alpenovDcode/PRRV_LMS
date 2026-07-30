import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(
    request,
    async () => {
      const { id } = await params;
      try {
        const { searchParams } = new URL(request.url);
        const courseId = searchParams.get("courseId");

        if (!courseId) {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: {
                code: "VALIDATION_ERROR",
                message: "courseId обязателен",
              },
            },
            { status: 400 }
          );
        }

        const lessons = await db.lesson.findMany({
          where: {
            module: {
              courseId,
            },
          },
          select: {
            id: true,
            title: true,
            type: true,
            orderIndex: true,
            module: {
              select: {
                id: true,
                title: true,
                orderIndex: true,
              },
            },
            homework: {
              where: { userId: id },
              orderBy: { createdAt: "desc" },
              take: 1,
              select: {
                id: true,
                status: true,
                createdAt: true,
              },
            },
          },
          orderBy: [{ module: { orderIndex: "asc" } }, { orderIndex: "asc" }],
        });

        const progresses = await db.lessonProgress.findMany({
          where: {
            userId: id,
            lessonId: { in: lessons.map((l) => l.id) },
          },
        });

        const progressMap = new Map(
          progresses.map((p) => [
            p.lessonId,
            {
              status: p.status,
              watchedTime: p.watchedTime,
              completedAt: p.completedAt,
            },
          ])
        );

        const result = lessons.map((lesson) => ({
          id: lesson.id,
          title: lesson.title,
          type: lesson.type,
          module: lesson.module,
          status: progressMap.get(lesson.id)?.status ?? "not_started",
          watchedTime: progressMap.get(lesson.id)?.watchedTime ?? 0,
          completedAt: progressMap.get(lesson.id)?.completedAt ?? null,
          latestSubmission: lesson.homework[0] ?? null,
        }));

        return NextResponse.json<ApiResponse>({ success: true, data: result }, { status: 200 });
      } catch (error) {
        console.error("Get user course progress error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Не удалось получить прогресс пользователя по курсу",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}
