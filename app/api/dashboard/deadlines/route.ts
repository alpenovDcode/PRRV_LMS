import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";

export async function GET(request: NextRequest) {
  return withAuth(request, async (req) => {
    try {
      // Находим все уроки с домашними заданиями, к которым у студента есть доступ
      const enrollments = await db.enrollment.findMany({
        where: {
          userId: req.user!.userId,
          status: "active",
        },
        include: {
          course: {
            include: {
              modules: {
                include: {
                  lessons: true,
                },
              },
            },
          },
        },
      });

      const now = new Date();
      const deadlines: Array<{
        id: string;
        lessonTitle: string;
        courseTitle: string;
        deadline: string;
        daysLeft: number;
        status: "pending" | "submitted" | "overdue";
      }> = [];

      for (const enrollment of enrollments) {
        for (const courseModule of enrollment.course.modules) {
          for (const lesson of courseModule.lessons) {
            // Проверяем наличие дедлайна в settings (JSON поле)
            const settings = lesson.settings as { homeworkDeadline?: string } | null;
            const homeworkDeadline = settings?.homeworkDeadline;

            if (homeworkDeadline) {
              const deadline = new Date(homeworkDeadline);
              const daysLeft = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

              // Проверяем, есть ли уже отправленное ДЗ
              const submission = await db.homeworkSubmission.findFirst({
                where: {
                  userId: req.user!.userId,
                  lessonId: lesson.id,
                  status: { in: ["pending", "approved"] },
                },
              });

              let status: "pending" | "submitted" | "overdue" = "pending";
              if (submission) {
                status = "submitted";
              } else if (daysLeft < 0) {
                status = "overdue";
              }

              deadlines.push({
                id: lesson.id,
                lessonTitle: lesson.title,
                courseTitle: enrollment.course.title,
                deadline: deadline.toISOString(),
                daysLeft,
                status,
              });
            }
          }
        }
      }

      // Сортируем по дедлайну (ближайшие первыми)
      deadlines.sort((a, b) => {
        if (a.status === "overdue" && b.status !== "overdue") return -1;
        if (a.status !== "overdue" && b.status === "overdue") return 1;
        return a.daysLeft - b.daysLeft;
      });

      return NextResponse.json<ApiResponse>(
        {
          success: true,
          data: deadlines.slice(0, 5), // Возвращаем 5 ближайших
        },
        { status: 200 }
      );
    } catch (error) {
      console.error("Get deadlines error:", error);
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Произошла ошибка при получении дедлайнов",
          },
        },
        { status: 500 }
      );
    }
  });
}

