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

      if (course) {
        console.log("DEBUG: Course found:", course.title);
        console.log("DEBUG: Modules count:", course.modules.length);
        course.modules.forEach((m: any) => {
          console.log(`DEBUG: Module ${m.title} (ID: ${m.id}, Parent: ${m.parentId}) - Lessons: ${m.lessons.length}`);
        });
      }

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

      // Fetch user details for access control
      const user = await db.user.findUnique({
        where: { id: req.user!.userId },
        include: {
          groupMembers: {
            select: { groupId: true },
          },
        },
      });

      if (!user) {
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "USER_NOT_FOUND",
              message: "Пользователь не найден",
            },
          },
          { status: 404 }
        );
      }

      const userGroupIds = user.groupMembers.map(gm => gm.groupId);

      // Filter modules based on access rules
      const accessibleModules = course.modules.filter((module: any) => {
        // 1. Tariff check
        if (module.allowedTariffs && module.allowedTariffs.length > 0) {
          if (!user.tariff || !module.allowedTariffs.includes(user.tariff)) {
            return false;
          }
        }

        // 2. Track check
        if (module.allowedTracks && module.allowedTracks.length > 0) {
          if (!user.track || !module.allowedTracks.includes(user.track)) {
            return false;
          }
        }

        // 3. Group check
        if (module.allowedGroups && module.allowedGroups.length > 0) {
          const hasGroupAccess = module.allowedGroups.some((allowedGroupId: string) => 
            userGroupIds.includes(allowedGroupId)
          );
          if (!hasGroupAccess) {
            return false;
          }
        }

        return true;
      });

      // Используем централизованную бизнес-логику для проверки доступности уроков
      const startDate = new Date(enrollment.startDate);

      const modulesWithLessons = await Promise.all(
        accessibleModules.map(async (module: any) => ({
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
          children: [], // Initialize children array
        }))
      );

      // Build hierarchy
      const modulesMap = new Map();
      const rootModules: any[] = [];

      modulesWithLessons.forEach((module) => {
        modulesMap.set(module.id, module);
      });

      modulesWithLessons.forEach((module) => {
        if (module.parentId) {
          const parent = modulesMap.get(module.parentId);
          if (parent) {
            parent.children.push(module);
            // Sort children by orderIndex
            parent.children.sort((a: any, b: any) => a.orderIndex - b.orderIndex);
          } else {
             console.log(`DEBUG: ORPHAN DETECTED! Module ${module.title} has parentId ${module.parentId} but parent not found in map.`);
             // If parent is missing (filtered out), should we show it as root? 
             // Currently it is DROPPED.
          }
        } else {
          console.log(`DEBUG: Module ${module.title} pushed to ROOT. ParentId: ${module.parentId}`);
          rootModules.push(module);
        }
      });

      // Sort root modules
      rootModules.sort((a: any, b: any) => a.orderIndex - b.orderIndex);

      return NextResponse.json<ApiResponse>(
        {
          success: true,
          data: {
            id: course.id,
            title: course.title,
            description: course.description,
            coverImage: course.coverImage,
            modules: rootModules,
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
