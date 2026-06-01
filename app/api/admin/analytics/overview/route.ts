import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";
import { subDays } from "date-fns";

export async function GET(request: NextRequest) {
  return withAuth(
    request,
    async () => {
      try {
        const now = new Date();
        const thirtyDaysAgo = subDays(now, 30);

        // Parallelize queries for performance
        const sevenDaysAgo = subDays(now, 7);

        const [
          totalUsers,
          totalStudents,
          newStudentsLast30Days,
          totalGroups,
          totalCourses,
          totalEnrollments,
          pendingHomeworks,
          recentProgressUsers,
        ] = await Promise.all([
          db.user.count(),
          db.user.count({ where: { role: "student" } }),
          db.user.count({ where: { role: "student", createdAt: { gte: thirtyDaysAgo } } }),
          db.group.count(),
          db.course.count({ where: { isPublished: true } }),
          db.enrollment.count({ where: { status: "active" } }),
          db.homeworkSubmission.count({ where: { status: "pending" } }),
          // Active students = distinct students with any lesson progress updated in last 7 days
          db.lessonProgress.findMany({
            where: { lastUpdated: { gte: sevenDaysAgo } },
            select: { userId: true },
            distinct: ["userId"],
          }),
        ]);

        const activeStudentsLast7Days = recentProgressUsers.length;

        const data = {
          totalUsers,
          totalStudents,
          newStudentsLast30Days,
          totalGroups,
          totalCourses,
          totalEnrollments,
          pendingHomeworks,
          activeStudentsLast7Days,
        };

        return NextResponse.json<ApiResponse>({ success: true, data }, { status: 200 });
      } catch (error) {
        console.error("Analytics overview error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Не удалось получить данные аналитики",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin, UserRole.curator] }
  );
}
