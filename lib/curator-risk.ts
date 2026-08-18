export type CuratorRiskLevel = "green" | "yellow" | "red";

export interface CuratorRiskSignal {
  code:
    | "never_started"
    | "inactive"
    | "no_lessons"
    | "no_homework"
    | "stuck"
    | "module_ignored"
    | "certification";
  label: string;
  points: number;
}

interface RiskInput {
  now: Date;
  enrolledAt: Date;
  lastActiveAt: Date | null;
  lastLearningActionAt: Date | null;
  completedLessons: number;
  totalLessons: number;
  homeworkCount: number;
  hasHomeworkLessons: boolean;
  certificationCompleted: boolean;
  hasCertification: boolean;
  latestModuleNotificationAt?: Date | null;
}

const daysSince = (now: Date, value: Date) =>
  Math.max(0, Math.floor((now.getTime() - value.getTime()) / 86_400_000));

export function calculateCuratorRisk(input: RiskInput) {
  const signals: CuratorRiskSignal[] = [];
  const enrollmentDays = daysSince(input.now, input.enrolledAt);
  const inactiveDays = daysSince(input.now, input.lastActiveAt ?? input.enrolledAt);
  const learningIdleDays = daysSince(input.now, input.lastLearningActionAt ?? input.enrolledAt);

  if (enrollmentDays >= 2 && input.completedLessons === 0 && !input.lastLearningActionAt) {
    signals.push({ code: "never_started", label: "Нет действий после старта", points: 40 });
  }
  if (inactiveDays >= 7) {
    signals.push({
      code: "inactive",
      label: `Не заходил ${inactiveDays} дн.`,
      points: inactiveDays >= 14 ? 35 : 20,
    });
  }
  if (enrollmentDays >= 5 && input.completedLessons === 0) {
    signals.push({ code: "no_lessons", label: "Не смотрит уроки", points: 25 });
  }
  if (input.hasHomeworkLessons && enrollmentDays >= 7 && input.homeworkCount === 0) {
    signals.push({ code: "no_homework", label: "Не сдаёт задания", points: 20 });
  }
  if (
    input.completedLessons > 0 &&
    input.completedLessons < input.totalLessons &&
    learningIdleDays >= 10
  ) {
    signals.push({ code: "stuck", label: `Завис на этапе ${learningIdleDays} дн.`, points: 30 });
  }
  if (
    input.latestModuleNotificationAt &&
    daysSince(input.now, input.latestModuleNotificationAt) >= 3 &&
    (!input.lastLearningActionAt || input.lastLearningActionAt < input.latestModuleNotificationAt)
  ) {
    signals.push({
      code: "module_ignored",
      label: "Не открыл модуль после уведомления",
      points: 20,
    });
  }
  if (
    input.hasCertification &&
    enrollmentDays >= 21 &&
    input.completedLessons >= Math.max(1, Math.floor(input.totalLessons * 0.7)) &&
    !input.certificationCompleted
  ) {
    signals.push({ code: "certification", label: "Не дошёл до сертификации", points: 25 });
  }

  const score = Math.min(
    100,
    signals.reduce((sum, signal) => sum + signal.points, 0)
  );
  const level: CuratorRiskLevel = score >= 50 ? "red" : score >= 25 ? "yellow" : "green";
  const priority = [
    "never_started",
    "inactive",
    "stuck",
    "module_ignored",
    "no_homework",
    "certification",
  ];
  const signalPriority = (code: CuratorRiskSignal["code"]) => {
    const index = priority.indexOf(code);
    return index === -1 ? priority.length : index;
  };
  const mainSignal = [...signals].sort(
    (a, b) => signalPriority(a.code) - signalPriority(b.code)
  )[0];
  const nextAction =
    mainSignal?.code === "never_started"
      ? "Написать и отправить инструкцию по старту"
      : mainSignal?.code === "inactive" || mainSignal?.code === "stuck"
        ? "Назначить короткий созвон"
        : mainSignal?.code === "module_ignored"
          ? "Напомнить об открытом модуле"
          : mainSignal?.code === "no_homework"
            ? "Отправить шаблон по выполнению задания"
            : mainSignal?.code === "certification"
              ? "Напомнить о сертификации"
              : "Поддержать темп обучения";

  return { score, level, signals, nextAction, inactiveDays, learningIdleDays };
}
