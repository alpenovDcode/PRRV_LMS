import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { addDays, startOfDay } from "date-fns";
import { ApiResponse } from "@/types";

interface CalendarEvent {
  id: string;
  title: string;
  date: string; // ISO date string
  type: "lesson_open";
  courseTitle: string;
  lessonId: string;
  slug: string;
}

interface DripRule {
  type: "after_start" | "on_date";
  days?: number;
  date?: string;
}

export async function GET(request: NextRequest) {
  return withAuth(request, async (req) => {
    try {
      const userId = req.user!.userId;

      // Get active enrollments
      const enrollments = await db.enrollment.findMany({
        where: {
          userId,
          status: "active",
        },
        include: {
          course: {
            include: {
              modules: {
                include: {
                  lessons: {
                    // Filter in memory to avoid Prisma JSON filter issues
                    // where: {
                    //   dripRule: {
                    //     not: null,
                    //   },
                    // },
                    select: {
                      id: true,
                      title: true,
                      dripRule: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      const events: CalendarEvent[] = [];

      for (const enrollment of enrollments) {
        const course = enrollment.course;
        
        for (const courseModule of course.modules) {
          for (const lesson of courseModule.lessons) {
            if (!lesson.dripRule) continue;

            const dripRule = lesson.dripRule as unknown as DripRule;
            let availableDate: Date | null = null;

            if (dripRule.type === "after_start" && dripRule.days !== undefined) {
              availableDate = addDays(startOfDay(enrollment.startDate), dripRule.days);
            } else if (dripRule.type === "on_date" && dripRule.date) {
              availableDate = startOfDay(new Date(dripRule.date));
            }

            if (availableDate) {
              events.push({
                id: lesson.id,
                title: lesson.title,
                date: availableDate.toISOString(),
                type: "lesson_open",
                courseTitle: course.title,
                lessonId: lesson.id,
                slug: course.slug,
              });
            }
          }
        }
      }

      // Sort by date
      events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      return NextResponse.json<ApiResponse>({
        success: true,
        data: events,
      });
    } catch (error) {
      console.error("Calendar events error:", error);
      return NextResponse.json<ApiResponse>(
        { success: false, error: { code: "INTERNAL_ERROR", message: "Failed to fetch calendar events" } },
        { status: 500 }
      );
    }
  });
}
