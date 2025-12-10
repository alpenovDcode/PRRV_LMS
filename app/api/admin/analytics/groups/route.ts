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
        // Fetch groups with their members' progress
        // This might be heavy, so we should be careful. 
        // Alternative: GroupBy on LessonProgress joined with User joined with GroupMember.
        // Prisma doesn't support deep relation aggregation in groupBy easily.
        // Let's fetch groups and count progress "manually" or via separate queries if needed, 
        // but for reasonable dataset size, fetching groups with counts is okay.
        
        // Better approach:
        // 1. Get all groups.
        // 2. For each group, count completed lessons by its members.
        
        const groups = await db.group.findMany({
          select: {
            id: true,
            name: true,
            members: {
              select: {
                user: {
                  select: {
                    progress: {
                      where: {
                        status: "completed",
                      },
                      select: {
                        lessonId: true, // Count by lessonId
                      },
                    },
                  },
                },
              },
            },
          },
        });

        const data = groups.map((group: any) => {
          const totalCompletedLessons = group.members.reduce((acc: number, member: any) => {
            return acc + member.user.progress.length;
          }, 0);

          return {
            name: group.name,
            completedLessons: totalCompletedLessons,
            memberCount: group.members.length,
          };
        });
        
        // Sort by activity
        data.sort((a, b) => b.completedLessons - a.completedLessons);

        return NextResponse.json<ApiResponse>({ success: true, data }, { status: 200 });
      } catch (error) {
        console.error("Analytics groups error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Не удалось получить статистику по группам",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin] }
  );
}
