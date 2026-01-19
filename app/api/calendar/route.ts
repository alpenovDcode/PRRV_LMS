import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { addDays, startOfDay } from "date-fns";
import { ApiResponse } from "@/types";

interface CalendarEvent {
  id: string;
  title: string;
  date: string; // ISO date string
  type: "lesson_open" | "deadline_homework" | "deadline_soft" | "deadline_hard";
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
                      settings: true,
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
            
            // 1. Drip Rule (Lesson Open)
            if (lesson.dripRule) {
              const dripRule = lesson.dripRule as unknown as DripRule;
              let availableDate: Date | null = null;

              if (dripRule.type === "after_start" && dripRule.days !== undefined) {
                availableDate = addDays(startOfDay(enrollment.startDate), dripRule.days);
              } else if (dripRule.type === "on_date" && dripRule.date) {
                availableDate = startOfDay(new Date(dripRule.date));
              }

              if (availableDate) {
                events.push({
                  id: `open-${lesson.id}`,
                  title: `Открытие: ${lesson.title}`,
                  date: availableDate.toISOString(),
                  type: "lesson_open",
                  courseTitle: course.title,
                  lessonId: lesson.id,
                  slug: course.slug,
                });
              }

              // 2. Soft Deadline
              // @ts-ignore
              if (dripRule.softDeadline) {
                 events.push({
                  id: `soft-${lesson.id}`,
                  title: `Мягкий дедлайн: ${lesson.title}`,
                  // @ts-ignore
                  date: new Date(dripRule.softDeadline).toISOString(),
                  type: "deadline_soft",
                  courseTitle: course.title,
                  lessonId: lesson.id,
                  slug: course.slug,
                });
              }

              // 3. Hard Deadline
              // @ts-ignore
              if (dripRule.hardDeadline) {
                 events.push({
                  id: `hard-${lesson.id}`,
                  title: `Жесткий дедлайн: ${lesson.title}`,
                  // @ts-ignore
                  date: new Date(dripRule.hardDeadline).toISOString(),
                  type: "deadline_hard",
                  courseTitle: course.title,
                  lessonId: lesson.id,
                  slug: course.slug,
                });
              }
            }

            // 4. Homework Deadline
            if (lesson.settings) {
               const settings = lesson.settings as any;
               if (settings.homeworkDeadline) {
                  events.push({
                    id: `hw-${lesson.id}`,
                    title: `Дедлайн ДЗ: ${lesson.title}`,
                    date: new Date(settings.homeworkDeadline).toISOString(),
                    type: "deadline_homework",
                    courseTitle: course.title,
                    lessonId: lesson.id,
                    slug: course.slug,
                  });
               }
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
