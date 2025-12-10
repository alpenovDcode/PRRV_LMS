import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { calculateDripAvailability, checkPrerequisites, type DripRule } from "@/lib/lms-logic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  return withAuth(request, async (req) => {
    try {
      const { slug } = await params;
        const course = await db.course.findUnique({
        where: { slug },
        include: {
          modules: {
            include: {
              lessons: {
                orderBy: { orderIndex: "asc" },
              },
            },
            orderBy: { orderIndex: "asc" },
          },
        },
      });

      if (!course) {
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Курс не найден",
            },
          },
          { status: 404 }
        );
      }

      // Check enrollment
      const enrollment = await db.enrollment.findUnique({
        where: {
          userId_courseId: {
            userId: req.user!.userId,
            courseId: course.id,
          },
        },
      });

      const hasAccess = enrollment && enrollment.status === "active";
      
      // If no access, return course info without detailed lesson data
      if (!hasAccess) {
        return NextResponse.json<ApiResponse>(
          {
            success: true,
            data: {
              id: course.id,
              title: course.title,
              description: course.description,
              coverImage: course.coverImage,
              modules: course.modules.map((module: any) => ({
                ...module,
                lessons: module.lessons.map((lesson: any) => ({
                  id: lesson.id,
                  title: lesson.title,
                  type: lesson.type,
                  orderIndex: lesson.orderIndex,
                  isFree: lesson.isFree,
                  isAvailable: false, // No access to lessons
                })),
              })),
              progress: 0,
              enrollment: null,
              hasAccess: false,
            },
          },
          { status: 200 }
        );
      }

      // Get progress for lessons
      const allLessons = course.modules.flatMap((m: any) => m.lessons);
      const progressRecords = await db.lessonProgress.findMany({
        where: {
          userId: req.user!.userId,
          lessonId: { in: allLessons.map((l: any) => l.id) },
        },
      });

      const progressMap = new Map(
        progressRecords.map((p: any) => [
          p.lessonId, 
          { 
            status: p.status, 
            watchedTime: p.watchedTime,
            completedAt: p.completedAt 
          }
        ])
      );

      // Calculate course progress
      const completedLessons = progressRecords.filter((p: any) => p.status === "completed").length;
      const totalLessons = allLessons.length;
      const progress = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

      // Используем централизованную бизнес-логику для проверки доступности уроков
      const startDate = new Date(enrollment.startDate);

      const modulesWithLessons = await Promise.all(
        course.modules.map(async (module: any) => ({
          ...module,
          lessons: await Promise.all(
            module.lessons.map(async (lesson: any) => {
              const lessonProgress = progressMap.get(lesson.id);
              
              // Find previous lesson for drip check
              const lessonIndex = allLessons.findIndex((l: any) => l.id === lesson.id);
              let previousLessonCompletedAt: Date | null = null;
              
              if (lessonIndex > 0) {
                const previousLessonId = allLessons[lessonIndex - 1].id;
                const prevProgress = progressMap.get(previousLessonId);
                if (prevProgress?.status === "completed" && prevProgress.completedAt) {
                  previousLessonCompletedAt = new Date(prevProgress.completedAt);
                }
              }

              // Проверка drip content
              const dripAvailability = calculateDripAvailability(
                lesson.dripRule as DripRule | null,
                startDate,
                previousLessonCompletedAt
              );

              // Проверка prerequisites (стоп-уроки)
              const prerequisitesCheck = await checkPrerequisites(req.user!.userId, lesson.id);

              const isAvailable = dripAvailability.isAvailable && prerequisitesCheck.isUnlocked;

              return {
                ...lesson,
                isAvailable,
                availableDate: dripAvailability.availableDate?.toISOString(),
                progress: lessonProgress ? {
                  status: lessonProgress.status,
                  watchedTime: lessonProgress.watchedTime
                } : null,
              };
            })
          ),
        }))
      );

      return NextResponse.json<ApiResponse>(
        {
          success: true,
          data: {
            id: course.id,
            title: course.title,
            description: course.description,
            coverImage: course.coverImage,
            modules: modulesWithLessons,
            progress,
            enrollment: {
              status: enrollment.status,
              startDate: enrollment.startDate.toISOString(),
              expiresAt: enrollment.expiresAt?.toISOString() || null,
            },
            hasAccess: true,
          },
        },
        { status: 200 }
      );
    } catch (error) {
      console.error("Get course detail error:", error);
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Произошла ошибка при получении курса",
          },
        },
        { status: 500 }
      );
    }
  });
}

