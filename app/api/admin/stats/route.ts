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
        const [totalCourses, publishedCourses, totalUsers, groupsCount, activeEnrollments] =
          await Promise.all([
            db.course.count(),
            db.course.count({ where: { isPublished: true } }),
            db.user.count(),
            db.group.count(),
            db.enrollment.count({ where: { status: "active" } }),
          ]);

        const [students, curators, admins] = await Promise.all([
          db.user.count({ where: { role: "student" } }),
          db.user.count({ where: { role: "curator" } }),
          db.user.count({ where: { role: "admin" } }),
        ]);

        const data = {
          totalCourses,
          publishedCourses,
          totalUsers,
          students,
          curators,
          admins,
          groups: groupsCount,
          activeEnrollments,
        };

        return NextResponse.json<ApiResponse>({ success: true, data }, { status: 200 });
      } catch (error) {
        console.error("Admin stats error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Не удалось получить статистику",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin] }
  );
}


