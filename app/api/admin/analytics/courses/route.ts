import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";

export async function GET(request: NextRequest) {
  return withAuth(
    request,
    async () => {
      try {
        const courses = await db.course.findMany({
          select: {
            id: true,
            title: true,
            _count: {
              select: {
                enrollments: true,
              },
            },
            enrollments: {
              select: {
                status: true,
              },
            },
            modules: {
              select: {
                lessons: {
                  select: {
                    progress: {
                      select: {
                        rating: true,
                      },
                    },
                  },
                },
              },
            },
          },
        });

        const data = courses.map((course: any) => {
          const totalEnrollments = course._count.enrollments;
          const activeEnrollments = course.enrollments.filter((e: any) => e.status === 'active').length;
          
          // Calculate average rating
          let totalRating = 0;
          let ratingCount = 0;

          course.modules.forEach((module: any) => {
            module.lessons.forEach((lesson: any) => {
              lesson.progress.forEach((p: any) => {
                if (p.rating) {
                  totalRating += p.rating;
                  ratingCount++;
                }
              });
            });
          });

          const averageRating = ratingCount > 0 ? Number((totalRating / ratingCount).toFixed(1)) : 0;

          return {
            id: course.id,
            title: course.title,
            totalEnrollments,
            activeEnrollments,
            averageRating,
          };
        });

        return NextResponse.json<ApiResponse>({ success: true, data }, { status: 200 });
      } catch (error) {
        console.error("Analytics courses error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Не удалось получить данные о курсах",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin] }
  );
}
