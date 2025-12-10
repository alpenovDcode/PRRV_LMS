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
        const [
          totalUsers,
          newUsersLast30Days,
          activeUsersLast30Days,
          totalCourses,
          totalEnrollments,
          pendingHomeworks,
        ] = await Promise.all([
          db.user.count(),
          db.user.count({
            where: {
              createdAt: {
                gte: thirtyDaysAgo,
              },
            },
          }),
          db.userSession.count({
            where: {
              lastActivityAt: {
                gte: thirtyDaysAgo,
              },
              isActive: true, // Assuming active sessions imply active users roughly, or distinct userId count would be better but Prisma count distinct is specific
            },
          }),
          db.course.count({
            where: {
              isPublished: true,
            },
          }),
          db.enrollment.count({
            where: {
              status: "active",
            },
          }),
          db.homeworkSubmission.count({
            where: {
              status: "pending",
            },
          }),
        ]);

        // For active users, session count might be misleading if one user has multiple sessions. 
        // A better approach for "Active Users" is counting distinct users who have logged in or acted recently.
        // Since Prisma count distinct is limited, let's try a different approach if needed, 
        // but for overview simple session count or just "new users" is often enough. 
        // Let's stick to "New Users" as a growth metric and "Total Users".
        
        const data = {
          totalUsers,
          newUsersLast30Days,
          totalCourses,
          totalEnrollments,
          pendingHomeworks,
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
    { roles: [UserRole.admin] }
  );
}
