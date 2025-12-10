import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { UserRole, HomeworkStatus } from "@prisma/client";

export async function GET(request: NextRequest) {
  return withAuth(
    request,
    async () => {
      try {
        const { searchParams } = new URL(request.url);
        const status = searchParams.get("status") as HomeworkStatus | null;
        const courseId = searchParams.get("courseId");

        const submissions = await db.homeworkSubmission.findMany({
          where: {
            status: status || undefined,
            lesson: courseId
              ? {
                  module: {
                    courseId,
                  },
                }
              : undefined,
          },
          include: {
            user: true,
            lesson: {
              include: {
                module: {
                  include: {
                    course: true,
                  },
                },
              },
            },
            curator: true,
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 100,
        });

        const data = submissions.map((s) => ({
          id: s.id,
          status: s.status,
          createdAt: s.createdAt,
          reviewedAt: s.reviewedAt,
          user: {
            id: s.user.id,
            fullName: s.user.fullName,
            email: s.user.email,
          },
          lesson: {
            id: s.lesson.id,
            title: s.lesson.title,
          },
          course: {
            id: s.lesson.module.course.id,
            title: s.lesson.module.course.title,
          },
        }));

        return NextResponse.json<ApiResponse>({ success: true, data }, { status: 200 });
      } catch (error) {
        console.error("Curator inbox error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Не удалось получить список домашних заданий",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.curator, UserRole.admin] }
  );
}


