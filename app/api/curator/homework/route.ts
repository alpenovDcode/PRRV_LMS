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
        const page = parseInt(searchParams.get("page") || "1");
        const limit = parseInt(searchParams.get("limit") || "20");
        const search = searchParams.get("search") || "";
        const type = searchParams.get("type") as "course" | "landing" | null; // "course" or "landing"
        const courseId = searchParams.get("courseId");

        const where: any = {
          status: status && status !== "all" as any ? status : undefined,
        };

        // Type filter
        if (type === "course") {
           where.lessonId = { not: null };
        } else if (type === "landing") {
           where.landingBlockId = { not: null };
        }

        if (courseId && courseId !== "all") {
           where.lesson = {
               module: {
                   courseId: courseId
               }
           };
        }

        // Search filter
        if (search) {
          where.OR = [
            { user: { fullName: { contains: search, mode: "insensitive" } } },
            { user: { email: { contains: search, mode: "insensitive" } } },
            { lesson: { title: { contains: search, mode: "insensitive" } } },
            { landingBlock: { page: { title: { contains: search, mode: "insensitive" } } } },
          ];
        }

        const skip = (page - 1) * limit;

        const [submissions, total] = await Promise.all([
          db.homeworkSubmission.findMany({
            where,
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
              landingBlock: {
                 include: { page: true }
              }
            },
            orderBy: {
              createdAt: "desc",
            },
            take: limit,
            skip: skip,
          }),
          db.homeworkSubmission.count({ where }),
        ]);

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
          lesson: s.lesson ? {
            id: s.lesson.id,
            title: s.lesson.title,
          } : null,
          landing: s.landingBlock ? {
             id: s.landingBlock.id,
             title: s.landingBlock.page?.title || "Лендинг",
             type: "landing"
          } : null,
          course: s.lesson ? {
            id: s.lesson.module.course.id,
            title: s.lesson.module.course.title,
          } : null,
        }));

        return NextResponse.json<ApiResponse>({ 
           success: true, 
           data,
           meta: {
              total,
              page,
              limit,
              totalPages: Math.ceil(total / limit)
           }
        }, { status: 200 });
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


