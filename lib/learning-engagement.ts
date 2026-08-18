import { db } from "@/lib/db";
import {
  checkLessonAvailability,
  resolveModuleAccess,
  type ModuleAccessContext,
} from "@/lib/lms-logic";
import { createNotification } from "@/lib/notifications";

export type LearningPrompt = {
  kind: "certification" | "new_module" | "continue";
  title: string;
  message: string;
  actionLabel: string;
  link: string;
  courseTitle: string;
};

function addDelay(date: Date, amount: number | null, unit: string | null) {
  if (amount === null || !unit) return date;
  if (unit === "days") date.setDate(date.getDate() + amount);
  if (unit === "weeks") date.setDate(date.getDate() + amount * 7);
  if (unit === "months") date.setMonth(date.getMonth() + amount);
  return date;
}

export function getLearningUnlockDate(
  effectiveModule: {
    openAt: Date | string | null;
    openAfterEvent: string | null;
    openAfterAmount: number | null;
    openAfterUnit: string | null;
  },
  context: ModuleAccessContext,
  resolvedGroupId?: string
) {
  if (effectiveModule.openAt) return new Date(effectiveModule.openAt);

  let eventDate: Date | null = null;
  if (effectiveModule.openAfterEvent === "certification_completed") {
    eventDate = context.certificationCompletedAt ?? null;
  } else if (effectiveModule.openAfterEvent === "track_definition_completed") {
    eventDate = context.trackDefinitionCompletedAt ?? null;
  } else if (effectiveModule.openAfterEvent === "group_start_date") {
    if (resolvedGroupId) eventDate = context.userGroupsMap.get(resolvedGroupId) ?? null;
    if (!eventDate) {
      const dates = [...context.userGroupsMap.values()].filter((date): date is Date =>
        Boolean(date)
      );
      eventDate = dates.sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
    }
  }

  return eventDate
    ? addDelay(new Date(eventDate), effectiveModule.openAfterAmount, effectiveModule.openAfterUnit)
    : null;
}

/**
 * Reconciles durable learning notifications and returns the single most
 * important action for the student. Safe to call repeatedly.
 */
export async function syncLearningEngagement(userId: string): Promise<LearningPrompt | null> {
  const now = new Date();
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      tariff: true,
      track: true,
      groupMembers: { select: { groupId: true, group: { select: { startDate: true } } } },
      enrollments: {
        where: {
          status: "active",
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        include: {
          course: {
            select: {
              id: true,
              title: true,
              slug: true,
              modules: {
                orderBy: { orderIndex: "asc" },
                include: {
                  lessons: {
                    orderBy: { orderIndex: "asc" },
                    include: { progress: { where: { userId } } },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!user) return null;

  const userGroupIds = user.groupMembers.map((membership) => membership.groupId);
  const userGroupsMap = new Map(
    user.groupMembers.map((membership) => [
      membership.groupId,
      membership.group.startDate ? new Date(membership.group.startDate) : null,
    ])
  );

  const certificationCandidates: Array<LearningPrompt & { lessonId: string }> = [];
  const newModuleCandidates: Array<LearningPrompt & { openedAt: Date }> = [];
  const continueCandidates: Array<LearningPrompt & { updatedAt: Date }> = [];
  const notificationTasks: Promise<void>[] = [];

  for (const enrollment of user.enrollments) {
    const lessons = enrollment.course.modules.flatMap((courseModule) => courseModule.lessons);
    const completedTrack = lessons
      .filter((lesson) => lesson.type === "track_definition" && lesson.progress[0]?.completedAt)
      .sort(
        (a, b) => b.progress[0].completedAt!.getTime() - a.progress[0].completedAt!.getTime()
      )[0];
    const completedCertification = lessons
      .filter((lesson) => lesson.type === "certification_form" && lesson.progress[0]?.completedAt)
      .sort(
        (a, b) => b.progress[0].completedAt!.getTime() - a.progress[0].completedAt!.getTime()
      )[0];

    const context: ModuleAccessContext = {
      userTariff: user.tariff,
      userTrack: user.track,
      userGroupIds,
      userGroupsMap,
      trackDefinitionCompletedAt: completedTrack?.progress[0].completedAt ?? null,
      certificationCompletedAt: completedCertification?.progress[0].completedAt ?? null,
      forcedModules: enrollment.forcedModules,
      now,
    };

    for (const courseModule of enrollment.course.modules) {
      const resolved = resolveModuleAccess(courseModule, context, enrollment.restrictedModules);
      if (!resolved.access.isAccessible) continue;

      const visibleLessons = courseModule.lessons.filter(
        (lesson) => !enrollment.restrictedLessons.includes(lesson.id)
      );
      const unfinishedLessons = visibleLessons.filter(
        (lesson) => lesson.progress[0]?.status !== "completed"
      );
      if (unfinishedLessons.length === 0) continue;

      const certification = unfinishedLessons.find(
        (lesson) => lesson.type === "certification_form"
      );
      if (certification) {
        const prompt = {
          kind: "certification" as const,
          title: "Пройдите сертификацию",
          message: `Сертификация «${certification.title}» доступна и необходима для продолжения обучения.`,
          actionLabel: "Пройти сертификацию",
          link: `/learn/${enrollment.course.slug}/${certification.id}`,
          courseTitle: enrollment.course.title,
          lessonId: certification.id,
        };
        certificationCandidates.push(prompt);
      }

      const unlockDate = getLearningUnlockDate(
        resolved.effectiveModule,
        context,
        resolved.resolvedGroupId
      );
      const hasSchedule = Boolean(
        resolved.effectiveModule.openAt || resolved.effectiveModule.openAfterEvent
      );
      const hasAnyProgress = visibleLessons.some((lesson) => Boolean(lesson.progress[0]));
      if (hasSchedule && unlockDate && unlockDate <= now && !hasAnyProgress) {
        const firstLesson = unfinishedLessons[0];
        const prompt = {
          kind: "new_module" as const,
          title: "Открылся новый модуль",
          message: `Модуль «${courseModule.title}» курса «${enrollment.course.title}» уже доступен.`,
          actionLabel: "Начать модуль",
          link: `/learn/${enrollment.course.slug}/${firstLesson.id}`,
          courseTitle: enrollment.course.title,
          openedAt: unlockDate,
        };
        newModuleCandidates.push(prompt);
        if (now.getTime() - unlockDate.getTime() <= 48 * 60 * 60 * 1000) {
          notificationTasks.push(
            createNotification(
              userId,
              "module_unlocked",
              prompt.title,
              prompt.message,
              prompt.link,
              `module-unlocked:${courseModule.id}`
            )
          );
        }
      }

      for (const lesson of unfinishedLessons) {
        const progress = lesson.progress[0];
        if (!progress || progress.status !== "in_progress") continue;
        continueCandidates.push({
          kind: "continue",
          title: "Продолжите обучение",
          message: `Вы остановились на уроке «${lesson.title}».`,
          actionLabel: "Продолжить",
          link: `/learn/${enrollment.course.slug}/${lesson.id}`,
          courseTitle: enrollment.course.title,
          updatedAt: progress.lastUpdated,
        });
      }
    }
  }

  for (const candidate of certificationCandidates) {
    const availability = await checkLessonAvailability(userId, candidate.lessonId);
    if (!availability.isAvailable) continue;
    notificationTasks.push(
      createNotification(
        userId,
        "certification_ready",
        candidate.title,
        candidate.message,
        candidate.link,
        `certification-ready:${candidate.lessonId}`
      )
    );
    await Promise.all(notificationTasks);
    return {
      kind: candidate.kind,
      title: candidate.title,
      message: candidate.message,
      actionLabel: candidate.actionLabel,
      link: candidate.link,
      courseTitle: candidate.courseTitle,
    };
  }

  await Promise.all(notificationTasks);

  const recentModule = newModuleCandidates
    .filter((candidate) => now.getTime() - candidate.openedAt.getTime() <= 7 * 24 * 60 * 60 * 1000)
    .sort((a, b) => b.openedAt.getTime() - a.openedAt.getTime())[0];
  if (recentModule) {
    return {
      kind: recentModule.kind,
      title: recentModule.title,
      message: recentModule.message,
      actionLabel: recentModule.actionLabel,
      link: recentModule.link,
      courseTitle: recentModule.courseTitle,
    };
  }

  const continuation = continueCandidates.sort(
    (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
  )[0];
  if (continuation) {
    return {
      kind: continuation.kind,
      title: continuation.title,
      message: continuation.message,
      actionLabel: continuation.actionLabel,
      link: continuation.link,
      courseTitle: continuation.courseTitle,
    };
  }

  return null;
}
