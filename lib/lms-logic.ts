import { db } from "@/lib/db";
import { isAfter } from "date-fns";
import { checkEnhancedDripAvailability, calculateEnhancedDripAvailability, EnhancedDripRule } from "./drip-content-enhanced";

export interface DripRule {
  type: "after_start" | "on_date";
  days?: number;
  date?: string;
}

export interface LessonAvailabilityResult {
  isAvailable: boolean;
  reason?: "not_enrolled" | "enrollment_not_active" | "enrollment_expired" | "drip_locked" | "prerequisites_not_met" | "hard_deadline_passed" | "access_denied";
  availableDate?: string;
  requiredLessonId?: string;
}

export async function checkLessonAvailability(userId: string, lessonId: string): Promise<LessonAvailabilityResult> {
  // 1. Fetch user details for access control
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      tariff: true,
      track: true,
      groupMembers: {
        select: { 
            groupId: true,
            group: {
                select: {
                    startDate: true
                }
            }
        },
      },
    },
  });

  // Fetch track definition progress separate or via user?
  // User model likely relates to LessonProgress.
  // Let's do a separate efficient query for track definition if needed, 
  // or just reusing the pattern from route.ts is fine.
  // Check if we can include it in user query.
  // user.lessonProgress...
  
  if (!user) {
    throw new Error("User not found");
  }

  // Fetch track definition status
  const trackDefProgress = await db.lessonProgress.findFirst({
      where: {
          userId: userId,
          status: "completed",
          lesson: { type: "track_definition" }
      },
      orderBy: { completedAt: 'desc' },
      select: { completedAt: true }
  });


  // 2. Fetch lesson with module access settings
  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    include: {
      module: {
        select: {
          id: true,
          allowedTariffs: true,
          allowedTracks: true,
          allowedGroups: true,
          trackSettings: true,
          openAt: true,
          openAfterAmount: true,
          openAfterUnit: true,
          openAfterEvent: true,
          course: {
            select: {
              enrollments: {
                where: { userId },
              },
            },
          },
        },
      },
      progress: {
        where: {
          userId,
        },
        take: 1,
      },
    },
  });

  if (!lesson) {
    throw new Error("Lesson not found");
  }

  // 3. Check Module Access Control (Centralized)
  const module = lesson.module;
  
  const userGroupIds = user.groupMembers.map((gm) => gm.groupId);
  const userGroupsMap = new Map<string, Date | null>();
  user.groupMembers.forEach(gm => {
      userGroupsMap.set(gm.groupId, gm.group.startDate ? new Date(gm.group.startDate) : null);
  });

  // @ts-ignore
  const restrictedModules: string[] = module.course.enrollments[0]?.restrictedModules as string[] || [];
  // @ts-ignore
  const forcedModules: string[] = module.course.enrollments[0]?.forcedModules as string[] || [];

  const context: ModuleAccessContext = {
      userTariff: user.tariff,
      userTrack: user.track,
      userGroupIds,
      userGroupsMap,
      trackDefinitionCompletedAt: trackDefProgress?.completedAt ? new Date(trackDefProgress.completedAt) : null,
      forcedModules
  };
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

  if (!accessResult.isAccessible) {
      // If time locked, checkLessonAvailability usually returns specific format or we rely on checkModuleAccess to return reason "time_locked"
      if (accessResult.reason === 'time_locked') {
           // We map 'time_locked' to 'drip_locked' or similar if we want to show date?
           // The interface allows 'drip_locked'.
           return {
               isAvailable: false,
               reason: "drip_locked",
               availableDate: accessResult.unlockDate ? accessResult.unlockDate.toISOString() : undefined
           };
      }
      return { isAvailable: false, reason: "access_denied" };
  }


  // 4. Check Enrollment
  const enrollment = lesson.module.course.enrollments[0];
  if (!enrollment) {
    return { isAvailable: false, reason: "not_enrolled" };
  }

  if (enrollment.status !== "active") {
    return { isAvailable: false, reason: "enrollment_not_active" };
  }

  if (enrollment.expiresAt && isAfter(new Date(), enrollment.expiresAt)) {
    return { isAvailable: false, reason: "enrollment_expired" };
  }

  // 5. Check Drip Content
  try {
    const dripResult = await checkEnhancedDripAvailability(userId, lessonId);
    if (!dripResult.isAvailable) {
      return {
        isAvailable: false,
        reason: dripResult.reason,
        availableDate: dripResult.availableDate,
      };
    }
  } catch (error) {
    console.error("Drip check failed:", error);
  }

  // 6. Check Prerequisites (Stop Lessons)
  const previousLesson = await db.lesson.findFirst({
    where: {
      moduleId: lesson.moduleId,
      orderIndex: {
        lt: lesson.orderIndex,
      },
    },
    orderBy: {
      orderIndex: "desc",
    },
    select: {
      id: true,
      isStopLesson: true,
    },
  });

  if (previousLesson?.isStopLesson) {
    const submission = await db.homeworkSubmission.findFirst({
      where: {
        userId,
        lessonId: previousLesson.id,
        status: "approved",
      },
    });

    if (!submission) {
      return {
        isAvailable: false,
        reason: "prerequisites_not_met",
        requiredLessonId: previousLesson.id,
      };
    }
  }

  return { isAvailable: true };
}

/**
 * Проверяет prerequisites для урока (стоп-уроки)
 */
export async function checkPrerequisites(userId: string, lessonId: string): Promise<{
  isUnlocked: boolean;
  reason?: string;
  requiredLessonId?: string;
}> {
  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    select: {
      id: true,
      orderIndex: true,
      moduleId: true,
      isStopLesson: true,
    },
  });

  if (!lesson) {
    throw new Error("Lesson not found");
  }

  // Find previous lesson in the same module
  const previousLesson = await db.lesson.findFirst({
    where: {
      moduleId: lesson.moduleId,
      orderIndex: {
        lt: lesson.orderIndex,
      },
    },
    orderBy: {
      orderIndex: "desc",
    },
  });

  if (!previousLesson) {
    return { isUnlocked: true };
  }

  if (previousLesson.isStopLesson) {
    // Check if homework is approved for previous lesson
    const submission = await db.homeworkSubmission.findFirst({
      where: {
        userId,
        lessonId: previousLesson.id,
        status: "approved",
      },
    });

    if (!submission) {
      return { 
        isUnlocked: false,
        reason: "previous_homework_required",
        requiredLessonId: previousLesson.id 
      };
    }
  }

  return { isUnlocked: true };
}

export function calculateDripAvailability(
  dripRule: DripRule | null | undefined,
  enrollmentStartDate: Date,
  previousLessonCompletedAt?: Date | null
): { isAvailable: boolean; availableDate?: Date } {
  const enhancedRule = dripRule as unknown as EnhancedDripRule | null;
  const result = calculateEnhancedDripAvailability(enhancedRule, enrollmentStartDate, previousLessonCompletedAt);
  
  return {
    isAvailable: result.isAvailable,
    availableDate: result.availableDate ? new Date(result.availableDate) : undefined,
  };
}

// --- Module Access Logic ---

export interface ModuleAccessContext {
  userTariff: string | null;
  userTrack: string | null;
  userGroupIds: string[];
  userGroupsMap: Map<string, Date | null>;
  trackDefinitionCompletedAt: Date | null;
  now?: Date;
  forcedModules?: string[];
}

export interface ModuleAccessResult {
  isAccessible: boolean;
  reason: "ok" | "tariff_mismatch" | "track_mismatch" | "group_mismatch" | "time_locked" | "restricted_manually";
  unlockDate: Date | null;
  details?: string;
}

export function checkModuleAccess(
  module: {
    id: string;
    title?: string;
    allowedTariffs: string[];
    allowedTracks: string[];
    allowedGroups: string[];
    openAt: Date | string | null;
    openAfterAmount: number | null;
    openAfterUnit: string | null;
    openAfterEvent: string | null;
  },
  context: ModuleAccessContext,
  restrictedModules: string[] = []
): ModuleAccessResult {
  const { userTariff, userTrack, userGroupIds, userGroupsMap, trackDefinitionCompletedAt, forcedModules } = context;
  const now = context.now || new Date();

  // -1. Check Forced Access
  if (forcedModules && forcedModules.includes(module.id)) {
      return { isAccessible: true, reason: "ok", unlockDate: null, details: "Доступ открыт принудительно администратором" };
  }

  // 0. Restricted Manually
  if (restrictedModules && restrictedModules.includes(module.id)) {
      return { isAccessible: false, reason: "restricted_manually", unlockDate: null, details: "Доступ закрыт вручную администратором" };
  }

  // 1. Tariff check
  if (module.allowedTariffs && module.allowedTariffs.length > 0) {
    if (!userTariff || !module.allowedTariffs.includes(userTariff)) {
      return { 
          isAccessible: false, 
          reason: "tariff_mismatch", 
          unlockDate: null,
          details: `Необходим тариф: ${module.allowedTariffs.join(", ")}. У пользователя: ${userTariff || "Нет тарифа"}`
      };
    }
  }

  // 2. Track check
  if (module.allowedTracks && module.allowedTracks.length > 0) {
    if (!userTrack || !module.allowedTracks.includes(userTrack)) {
      return { 
          isAccessible: false, 
          reason: "track_mismatch", 
          unlockDate: null,
          details: `Необходим трек: ${module.allowedTracks.join(", ")}. У пользователя: ${userTrack || "Нет трека"}`
      };
    }
  }

  // 3. Group check
  if (module.allowedGroups && module.allowedGroups.length > 0) {
    const hasGroupAccess = module.allowedGroups.some((allowedGroupId) =>
      userGroupIds.includes(allowedGroupId)
    );
    if (!hasGroupAccess) {
      return { 
          isAccessible: false, 
          reason: "group_mismatch", 
          unlockDate: null,
          details: "Пользователь не состоит ни в одной из разрешенных групп"
      };
    }
  }

  // 4. Time-based check
  
  // 4.1 Absolute date
  if (module.openAt) {
    const openAtDate = new Date(module.openAt);
    if (now < openAtDate) {
      return { isAccessible: false, reason: "time_locked", unlockDate: openAtDate };
    }
  }

  // 4.2 Relative date (Event-based)
  if (module.openAfterEvent === "track_definition_completed") {
    if (!trackDefinitionCompletedAt) {
      // Event hasn't happened yet
      return { isAccessible: false, reason: "time_locked", unlockDate: null, details: "Waiting for track definition" };
    }

    if (module.openAfterAmount && module.openAfterUnit) {
      const openDate = new Date(trackDefinitionCompletedAt);
      addTime(openDate, module.openAfterAmount, module.openAfterUnit);

      if (now < openDate) {
        return { isAccessible: false, reason: "time_locked", unlockDate: openDate };
      }
    }
  } else if (module.openAfterEvent === "group_start_date") {
    // Logic: Check all allowed groups user is in
    let eligibleGroups: string[] = [];
    if (module.allowedGroups && module.allowedGroups.length > 0) {
      eligibleGroups = module.allowedGroups.filter((gId) => userGroupIds.includes(gId));
    } else {
      eligibleGroups = userGroupIds;
    }

    if (eligibleGroups.length === 0) {
         // Should have been caught by group check, but redundancy is fine
         return { isAccessible: false, reason: "group_mismatch", unlockDate: null };
    }

    // We calculate the earliest possible unlock date that is MET
    // Or if none are met, the earliest possible unlock date in the FUTURE?
    // Actually, if ANY group grants access (start date + valid time), it's open.
    // If multiple groups, we probably take the "best" one (earliest access).
    
    let bestUnlockDate: Date | null = null;
    let hasAccess = false;

    // Use a loop to check all groups
    for (const groupId of eligibleGroups) {
        const startDate = userGroupsMap.get(groupId);
        if (!startDate) continue;

        if (module.openAfterAmount && module.openAfterUnit) {
            const openDate = new Date(startDate);
            addTime(openDate, module.openAfterAmount, module.openAfterUnit);

            if (now >= openDate) {
                hasAccess = true;
                bestUnlockDate = openDate;
                break; // Found one that is already open!
            } else {
                // It's in the future. Keep track of the *earliest* future unlock date.
                if (!bestUnlockDate || openDate < bestUnlockDate) {
                    bestUnlockDate = openDate;
                }
            }
        } else {
            // No delay, opens immediately with group start
             hasAccess = true;
             bestUnlockDate = startDate;
             if (now >= startDate) break;
        }
    }

    if (!hasAccess) {
        return { isAccessible: false, reason: "time_locked", unlockDate: bestUnlockDate };
    }
  }

  return { isAccessible: true, reason: "ok", unlockDate: null };
}

function addTime(date: Date, amount: number, unit: string) {
    if (unit === 'days') {
        date.setDate(date.getDate() + amount);
    } else if (unit === 'weeks') {
        date.setDate(date.getDate() + (amount * 7));
    } else if (unit === 'months') {
        date.setMonth(date.getMonth() + amount);
    }
}
