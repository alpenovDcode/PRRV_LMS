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
        const { searchParams } = new URL(request.url);
      const currentLessonId = searchParams.get("lessonId");

      if (!currentLessonId) {
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "MISSING_PARAM",
              message: "Не указан ID урока",
            },
          },
          { status: 400 }
        );
      }

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
      
      if (!hasAccess) {
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "NO_ACCESS",
              message: "Нет доступа к курсу",
            },
          },
          { status: 403 }
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
            completedAt: p.completedAt 
          }
        ])
      );

      const startDate = new Date(enrollment.startDate);

      // Calculate availability for all lessons to build navigation
      const modulesWithLessons = await Promise.all(
        course.modules.map(async (module: any) => ({
          id: module.id,
          title: module.title,
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
                id: lesson.id,
                title: lesson.title,
                type: lesson.type,
                orderIndex: lesson.orderIndex,
                isAvailable,
                progress: lessonProgress ? { status: lessonProgress.status } : null,
              };
            })
          ),
          parentId: module.parentId, // Ensure parentId is passed
        }))
      );

      // Structure modules hierarchically
      const structuredModules = structureModules(modulesWithLessons);

      // Determine prev/next navigation
      const flattenedLessons = modulesWithLessons.flatMap(m => m.lessons);
      const currentIndex = flattenedLessons.findIndex(l => l.id === currentLessonId);
      
      let prevLessonId: string | null = null;
      let nextLessonId: string | null = null;

      if (currentIndex !== -1) {
        if (currentIndex > 0) {
          const prevLesson = flattenedLessons[currentIndex - 1];
          // Only allow navigation to previous if it is available (should be, but good to check)
          if (prevLesson.isAvailable) {
            prevLessonId = prevLesson.id;
          }
        }
        
        if (currentIndex < flattenedLessons.length - 1) {
          const nextLesson = flattenedLessons[currentIndex + 1];
          // Only allow navigation to next if it is available
          if (nextLesson.isAvailable) {
            nextLessonId = nextLesson.id;
          }
        }
      }

      return NextResponse.json<ApiResponse>(
        {
          success: true,
          data: {
            modules: structuredModules,
            currentLessonId,
            prevLessonId,
            nextLessonId,
          },
        },
        { status: 200 }
      );
    } catch (error) {
      console.error("Get course navigation error:", error);
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Произошла ошибка при получении навигации",
          },
        },
        { status: 500 }
      );
    }
  });
}

function structureModules(modules: any[]) {
  const modulesMap = new Map();
  const rootModules: any[] = [];

  // Initialize map and ensure children array
  modules.forEach((module) => {
    if (!module.children) module.children = [];
    modulesMap.set(module.id, module);
  });

  // Build hierarchy
  modules.forEach((module) => {
    if (module.parentId) {
      const parent = modulesMap.get(module.parentId);
      if (parent) {
        parent.children.push(module);
        // Sort children by orderIndex
        parent.children.sort((a: any, b: any) => a.orderIndex - b.orderIndex);
      }
    } else {
      rootModules.push(module);
    }
  });

  // Sort root modules
  rootModules.sort((a: any, b: any) => a.orderIndex - b.orderIndex);

  return rootModules;
}
