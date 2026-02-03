import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { calculateDripAvailability, checkPrerequisites, checkModuleAccess, type DripRule, type ModuleAccessContext } from "@/lib/lms-logic";

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
      
      // If no access, return course info without detailed lesson data but WITH hierarchy
      if (!hasAccess) {
        const flatModules = course.modules.map((module: any) => ({
          ...module,
          lessons: module.lessons.map((lesson: any) => ({
            id: lesson.id,
            title: lesson.title,
            type: lesson.type,
            orderIndex: lesson.orderIndex,
            isFree: lesson.isFree,
            isAvailable: false, // No access to lessons
          })),
          children: [],
        }));

        const structuredModules = structureModules(flatModules);

        return NextResponse.json<ApiResponse>(
          {
            success: true,
            data: {
              id: course.id,
              title: course.title,
              description: course.description,
              coverImage: course.coverImage,
              modules: structuredModules,
              progress: 0,
              enrollment: enrollment ? {
                status: enrollment.status,
                startDate: enrollment.startDate.toISOString(),
                expiresAt: enrollment.expiresAt?.toISOString() || null,
              } : null,
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
            include: {
                 group: {
                     select: {
                         id: true,
                         startDate: true,

                     }
                 }
            }
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
      // Map of group start dates for quick lookup
      const userGroupsMap = new Map<string, Date | null>();
      user.groupMembers.forEach(gm => {
          userGroupsMap.set(gm.groupId, gm.group.startDate ? new Date(gm.group.startDate) : null);
      });

      // Find user's track definition lesson completion date
      let trackDefinitionCompletedAt: Date | null = null;
      // We look for ANY completed lesson of type track_definition in this course or globally?
      // Assuming track definition is per-user and likely unique effectively.
      // Better: check for completion of ANY lesson with type 'track_definition'
      const trackDefProgress = await db.lessonProgress.findFirst({
        where: {
          userId: user.id,
          status: "completed",
          lesson: {
             type: "track_definition",
             // Optional: restrict to current course if needed, but track might be global
          } 
        },
        orderBy: { completedAt: 'desc' }
      });
      
      if (trackDefProgress && trackDefProgress.completedAt) {
          trackDefinitionCompletedAt = new Date(trackDefProgress.completedAt);
      }

      const context: ModuleAccessContext = {
          userTariff: user.tariff,
          userTrack: user.track,
          userGroupIds,
          userGroupsMap,
          trackDefinitionCompletedAt,
          // @ts-ignore
          forcedModules: enrollment.forcedModules as string[] || []
      };

      // Filter modules based on access rules
      const accessibleModules = course.modules.filter((module: any) => {
        // @ts-ignore
        const restrictedModules = enrollment.restrictedModules as string[] || [];

        // Apply track specific logic if exists
        let effectiveModule = { ...module };
        if (user.track && module.trackSettings) {
             const settings = (module.trackSettings as Record<string, any>)[user.track];
             if (settings) {
                 if (settings.openAt) effectiveModule.openAt = settings.openAt;
                 if (settings.openAfterEvent) {
                     effectiveModule.openAfterEvent = settings.openAfterEvent;
                     effectiveModule.openAfterAmount = settings.openAfterAmount;
                     effectiveModule.openAfterUnit = settings.openAfterUnit;
                 }
             }
        }

        const accessResult = checkModuleAccess(effectiveModule, context, restrictedModules);

        // Hide module if NOT accessible.
        // matches user request: "should be open and available only those modules... to which he has access"
        return accessResult.isAccessible;
      });

      // Используем централизованную бизнес-логику для проверки доступности уроков
      const startDate = new Date(enrollment.startDate);

      const modulesWithLessons = await Promise.all(
        accessibleModules.map(async (module: any) => {
          // Filter restricted lessons (NEW)
          const filteredLessons = module.lessons.filter((lesson: any) => {
             // @ts-ignore
             return !(enrollment.restrictedLessons && enrollment.restrictedLessons.includes(lesson.id));
          });

          return {
            ...module,
            lessons: await Promise.all(
              filteredLessons.map(async (lesson: any) => {
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
        }
      }));

      const structuredModules = structureModules(modulesWithLessons);

      return NextResponse.json<ApiResponse>(
        {
          success: true,
          data: {
            id: course.id,
            title: course.title,
            description: course.description,
            coverImage: course.coverImage,
            modules: structuredModules,
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
      // If parent not found (e.g. filtered out), module effectively disappears or becomes orphan
      // Current logic: drop it. If you want to show orphans as roots, push to rootModules here.
    } else {
      rootModules.push(module);
    }
  });

  // Sort root modules
  rootModules.sort((a: any, b: any) => a.orderIndex - b.orderIndex);

  return rootModules;
}
