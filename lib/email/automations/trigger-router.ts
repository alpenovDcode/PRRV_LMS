import { db } from "@/lib/db";
import type { AutomationStep, FireTriggerOptions, TriggerType } from "./types";
import { getStepDelay } from "./types";

/**
 * Запускает автоматизации, привязанные к заданному триггеру, для конкретного
 * пользователя. Вызывается из доменных хуков (регистрация, покупка курса и т.п.).
 *
 * Логика:
 *   1. Найти все active EmailAutomation с trigger=type.
 *   2. Для каждого создать EmailAutomationRun (если у пользователя ещё нет
 *      активного run этой автоматизации).
 *   3. nextStepAt = now + delayHours[0] часов.
 *
 * Не падает на ошибках — это fire-and-forget из хуков, ошибка автоматизации
 * не должна валить регистрацию пользователя или оплату. Логирует и идёт дальше.
 *
 * Идемпотентность: повторный fireTrigger не создаёт дубли — для пары
 * (userId, automationId) допустим только один не-completed run.
 */
export async function fireTrigger(
  trigger: TriggerType,
  userId: string,
  options: FireTriggerOptions = {}
): Promise<{ started: number }> {
  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, marketingOptOut: true, isBlocked: true },
    });
    if (!user) return { started: 0 };
    // Не запускаем автоматизации для отписавшихся / заблокированных.
    if (user.marketingOptOut || user.isBlocked) return { started: 0 };

    const automations = await db.emailAutomation.findMany({
      where: { trigger, isActive: true },
      select: { id: true, steps: true, triggerData: true },
    });

    let started = 0;
    const now = Date.now();

    for (const a of automations) {
      const steps = (a.steps as AutomationStep[] | null) ?? [];
      if (steps.length === 0) continue;

      // Защита от дублей: один активный run на (userId, automationId).
      const existing = await db.emailAutomationRun.findFirst({
        where: { userId, automationId: a.id, status: "running" },
        select: { id: true },
      });
      if (existing) continue;

      // Фильтр triggerData (пример: course_purchased с конкретным courseId).
      if (a.triggerData && !matchesTriggerData(a.triggerData, options.triggerData)) {
        continue;
      }

      const firstStepDelay = getStepDelay(steps[0]);
      const nextStepAt = new Date(now + firstStepDelay * 60 * 60 * 1000);

      await db.emailAutomationRun.create({
        data: {
          automationId: a.id,
          userId,
          currentStep: 0,
          nextStepAt,
          status: "running",
        },
      });
      started++;
    }

    return { started };
  } catch (e) {
    console.error(`[trigger-router] fireTrigger(${trigger}, ${userId}) failed:`, e);
    return { started: 0 };
  }
}

/**
 * Проверяет, что фактические triggerData удовлетворяют ограничениям
 * автоматизации. Прямое равенство по всем ключам.
 *
 * Например автоматизация: { courseId: "abc" }
 * Срабатывание:           { courseId: "abc", paymentAmount: 29900 } ✓
 * Срабатывание:           { courseId: "xyz" } ✗ — не подходит
 */
function matchesTriggerData(
  expected: unknown,
  actual: Record<string, unknown> | undefined
): boolean {
  if (!expected || typeof expected !== "object") return true;
  if (!actual) return false;
  const exp = expected as Record<string, unknown>;
  for (const [k, v] of Object.entries(exp)) {
    if (v === undefined || v === null) continue; // null/undefined в expected = «любое»
    if (actual[k] !== v) return false;
  }
  return true;
}
