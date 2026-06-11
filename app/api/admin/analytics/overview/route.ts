import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";
import { rangeToFromDate } from "@/lib/analytics-range";

export async function GET(request: NextRequest) {
  return withAuth(
    request,
    async () => {
      try {
        const url = new URL(request.url);
        const range = url.searchParams.get("range") ?? "30d";
        const fromDate = rangeToFromDate(range);

        const [
          totalUsers,
          totalStudents,
          newStudentsInRange,
          totalGroups,
          totalCourses,
          totalEnrollments,
          pendingHomeworks,
          recentProgressUsers,
        ] = await Promise.all([
          db.user.count(),
          db.user.count({ where: { role: "student" } }),
          db.user.count({
            where: {
              role: "student",
              ...(fromDate ? { createdAt: { gte: fromDate } } : {}),
            },
          }),
          db.group.count(),
          db.course.count({ where: { isPublished: true } }),
          db.enrollment.count({ where: { status: "active" } }),
          db.homeworkSubmission.count({ where: { status: "pending" } }),
          db.lessonProgress.groupBy({
            by: ["userId"],
            where: {
              ...(fromDate ? { lastUpdated: { gte: fromDate } } : {}),
              user: { enrollments: { some: { status: "active" } } },
            },
          }),
        ]);

        const activeStudentsInRange = recentProgressUsers.length;

        return NextResponse.json<ApiResponse>(
          {
            success: true,
            data: {
              totalUsers,
              totalStudents,
              newStudentsInRange,
              totalGroups,
              totalCourses,
              totalEnrollments,
              pendingHomeworks,
              activeStudentsInRange,
              range,
            },
          },
          { status: 200 }
        );
      } catch (error) {
        console.error("Analytics overview error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: { code: "INTERNAL_ERROR", message: "Не удалось получить данные аналитики" },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}
