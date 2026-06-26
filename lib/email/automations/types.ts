/**
 * Тип триггера автоматизации.
 *
 *  - user_registered    — после успешной регистрации (одноразово)
 *  - course_purchased   — после активации заказа (одноразово per заказ)
 *  - inactive_30d       — пользователь не активен 30+ дней (периодический поиск)
 *  - course_completed   — пользователь завершил курс (одноразово per курс)
 *
 * triggerData в EmailAutomation хранит параметры триггера:
 *  - inactive_30d: { days: number } — порог неактивности
 *  - course_purchased: { courseId?: string } — фильтр по конкретному курсу
 *  - course_completed: { courseId?: string }
 */
export const TRIGGER_TYPES = [
  "user_registered",
  "course_purchased",
  "inactive_30d",
  "course_completed",
] as const;

export type TriggerType = (typeof TRIGGER_TYPES)[number];

/**
 * Шаги цепочки. Три типа:
 *   - email: отправка письма
 *   - condition: проверка взаимодействия (открыл / кликнул) предыдущего шага.
 *     По результату либо идём дальше, либо пропускаем skipSteps шагов вперёд.
 *     Это даёт if/else flow без отдельного DAG.
 *   - exit_on_event: жёсткий выход из цепочки если случилось событие.
 *     Используется для «купил → стоп дожимающей серии».
 */
export type AutomationStep = EmailStep | ConditionStep | ExitStep;

export interface EmailStep {
  type?: "email"; // legacy: без type считаем email (обратная совместимость)
  /** Задержка от предыдущего шага (или от старта для первого) в часах. */
  delayHours: number;
  /** Шаблон для отправки на этом шаге. */
  templateId: string;
  /** Описание для админа в UI. */
  label?: string;
}

export interface ConditionStep {
  type: "condition";
  /** Откуда смотрим метрику. По умолчанию — предыдущий email-шаг (currentStep - 1). */
  referenceStepIndex?: number;
  /** Что считаем за «выполнено». */
  metric: "opened" | "clicked";
  /** Окно проверки от sentAt предыдущего шага. */
  withinHours: number;
  /**
   * Что сделать если условие НЕ выполнено:
   *   - skipSteps: 1 — пропустить следующий step
   *   - skipSteps: 999 — выйти из цепочки (status=completed)
   */
  skipStepsIfFalse: number;
  label?: string;
}

export interface ExitStep {
  type: "exit_on_event";
  /**
   * События которые завершают цепочку. Например:
   *   - "order.paid" — если юзер купил, дальше не дожимаем
   *   - "email.unsubscribed" — отписался → выход (на самом деле checking
   *     marketingOptOut и так делается в начале каждого шага, но event-based
   *     даёт точечный выход именно из этой цепочки)
   */
  events: Array<"order.paid" | "email.unsubscribed" | "email.clicked" | "email.opened">;
  /**
   * Окно проверки события. Если не задано — с момента старта run'а
   * (по умолчанию).
   */
  withinHoursSinceStart?: number;
  label?: string;
}

export function getStepType(step: AutomationStep): "email" | "condition" | "exit_on_event" {
  if (!step) return "email";
  if ((step as { type?: string }).type === "condition") return "condition";
  if ((step as { type?: string }).type === "exit_on_event") return "exit_on_event";
  return "email";
}

/**
 * Возвращает delayHours шага. Для email-шагов — поле delayHours. Для
 * condition / exit_on_event — 0 (они обрабатываются мгновенно при currentStep
 * на них, без задержки).
 */
export function getStepDelay(step: AutomationStep): number {
  if (getStepType(step) === "email") {
    return Math.max(0, (step as EmailStep).delayHours ?? 0);
  }
  return 0;
}

export interface FireTriggerOptions {
  /**
   * Дополнительные данные триггера. Передаются в EmailDeliveryJob.variables
   * и доступны в шаблоне как {{...}}. Например для course_purchased:
   *   { courseId, courseName, paymentAmount }
   */
  triggerData?: Record<string, unknown>;
}
