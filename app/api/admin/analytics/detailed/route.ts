import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { subDays } from "date-fns";
import { ApiResponse } from "@/types";

export async function GET(request: NextRequest) {
  return withAuth(request, async (req) => {
    try {
      // 1. Risk Students: Inactive for > 7 days, excluding admins/curators
      const sevenDaysAgo = subDays(new Date(), 7);
      
      // Get all students
      const students = await db.user.findMany({
        where: {
            role: "student",
            isBlocked: false,
        },
        include: {
            userSessions: {
                orderBy: {
                    lastActivityAt: 'desc'
                },
                take: 1
            },
            courses: { // Check enrollment to ensure they are active students
                 include: {
                     enrollments: true
                 }
            }
        }
      });
      
      const riskStudents = students.filter(student => {
          // If no session, check createdAt. If createdAt > 7 days ago, they are at risk.
          // If has session, check lastActivityAt.
          const lastActivity = student.userSessions[0]?.lastActivityAt || student.createdAt;
          return lastActivity < sevenDaysAgo;
      }).map(s => ({
          id: s.id,
          fullName: s.fullName,
          email: s.email,
          lastActivity: s.userSessions[0]?.lastActivityAt || s.createdAt,
          tariff: s.tariff
      }));

      // 2. Homework Performance
      const allSubmissions = await db.homeworkSubmission.findMany({
          select: {
              status: true,
              createdAt: true,
              reviewedAt: true,
          }
      });

      const homeworkStats = {
          total: allSubmissions.length,
          pending: allSubmissions.filter(s => s.status === 'pending').length,
          approved: allSubmissions.filter(s => s.status === 'approved').length,
          rejected: allSubmissions.filter(s => s.status === 'rejected').length,
          avgReviewTimeMinutes: 0
      };

      const reviewedSubmissions = allSubmissions.filter(s => s.reviewedAt);
      if (reviewedSubmissions.length > 0) {
          const totalReviewTimeMs = reviewedSubmissions.reduce((acc, curr) => {
              return acc + (new Date(curr.reviewedAt!).getTime() - new Date(curr.createdAt).getTime());
          }, 0);
          homeworkStats.avgReviewTimeMinutes = Math.round((totalReviewTimeMs / reviewedSubmissions.length) / 1000 / 60);
      }

      // 3. Lesson Funnel (Top 10 lessons by drop-off or just completion counts)
      // Since we don't have a rigid sequence defined globally, we'll aggregate by lesson title/order across modules.
      // A better proxy for a funnel is looking at LessonProgress completion counts.
      
      const lessonProgress = await db.lessonProgress.groupBy({
          by: ['lessonId'],
          where: {
              status: 'completed'
          },
          _count: {
              userId: true
          }
      });

      // We need lesson details (order, title) to sort them intelligently
      const lessons = await db.lesson.findMany({
          select: {
              id: true,
              title: true,
              orderIndex: true,
              module: {
                  select: {
                      title: true,
                      orderIndex: true
                  }
              }
          }
      });

      // Map progress to lessons
      const funnel = lessons.map(lesson => {
          const completedCount = lessonProgress.find(p => p.lessonId === lesson.id)?._count.userId || 0;
          return {
              id: lesson.id,
              title: lesson.title,
              moduleTitle: lesson.module.title,
              completedCount,
              sortKey: (lesson.module.orderIndex * 1000) + lesson.orderIndex // simplistic sorting
          };
      }).sort((a, b) => a.sortKey - b.sortKey).slice(0, 15); // Take first 15 for the chart

      return NextResponse.json<ApiResponse>({
        success: true,
        data: {
            riskStudents,
            homeworkStats,
            funnel
        },
      });

    } catch (error) {
      console.error("Analytics error:", error);
      return NextResponse.json<ApiResponse>(
        { success: false, error: { code: "INTERNAL_ERROR", message: "Failed to fetch analytics" } },
        { status: 500 }
      );
    }
  });
}
