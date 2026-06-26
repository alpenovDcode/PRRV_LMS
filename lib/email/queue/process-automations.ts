import { db } from "@/lib/db";
import { getMarketingEmailProvider } from "@/lib/email/providers/factory";
import { applyVariablesAndTracking, extractFirstName } from "@/lib/email/compiler/variables";
import type {
  AutomationStep,
  ConditionStep,
  ExitStep,
  EmailStep,
} from "@/lib/email/automations/types";
import { getStepType, getStepDelay } from "@/lib/email/automations/types";
import { classifyError, computeNextAttempt, MAX_ATTEMPTS } from "@/lib/email/queue/retry-policy";

/**
 * Воркер автоматизаций. Дёргается из /api/email-cron/tick параллельно с
 * processCampaigns.
 *
 * Архитектурно отдельно от кампаний:
 *   - Кампания: пакетная отправка по сегменту через EmailDeliveryJob очередь
 *     (retry с exponential backoff, batch).
 *   - Автоматизация: триггерный одиночный send. Шлём напрямую через провайдер,
 *     статус трекается в EmailAutomationRun. Это проще — не нужно создавать
 *     техническую EmailCampaign на каждую цепочку, не нужны лишние поля.
 *
 * Алгоритм одного шага:
 *   1. Берём running run где nextStepAt <= now.
 *   2. Проверяем что автоматизация всё ещё active.
 *   3. Проверяем пользователя (не отписался, не заблокирован) → иначе cancel.
 *   4. Достаём шаг steps[currentStep] и его шаблон.
 *   5. Шлём через provider.sendOne (HTML + переменные + tracking).
 *   6. Записываем EmailEvent type="sent".
 *   7. Продвигаем currentStep++. Если шаги закончились → status=completed.
 *
 * Что в Спринте 7 polish добавим:
 *   - Метрики per-automation (sent/opened/clicked) в EmailAutomation.stats
 *   - Retry при transient SMTP-ошибке (сейчас просто помечаем failed)
 */

const BATCH_SIZE = 50;

export interface AutomationsResult {
  processed: number;
  stepsSent: number;
  cancelled: number;
  completed: number;
  failed: number;
}

export async function processDueAutomationRuns(
  now: Date = new Date()
): Promise<AutomationsResult> {
  const runs = await db.emailAutomationRun.findMany({
    where: {
      status: "running",
      nextStepAt: { lte: now },
    },
    orderBy: { nextStepAt: "asc" },
    take: BATCH_SIZE,
    include: {
      automation: { select: { id: true, isActive: true, steps: true, name: true, stats: true } },
      user: {
        select: {
          id: true,
          email: true,
          fullName: true,
          unsubscribeToken: true,
          marketingOptOut: true,
          isBlocked: true,
        },
      },
    },
  });

  let stepsSent = 0;
  let cancelled = 0;
  let completed = 0;
  let failed = 0;

  const provider = getMarketingEmailProvider();
  const fromName = process.env.EMAIL_MARKETING_FROM_NAME ?? "Прорыв";
  const fromEmail =
    process.env.EMAIL_MARKETING_FROM_EMAIL ?? process.env.SMTP_USER ?? "noreply@prrv.tech";

  for (const run of runs) {
    try {
      // Автоматизация выключена → отменяем run.
      if (!run.automation.isActive) {
        await db.emailAutomationRun.update({
          where: { id: run.id },
          data: { status: "cancelled" },
        });
        cancelled++;
        continue;
      }

      // Пользователь отписался / заблокирован → отменяем.
      if (run.user.marketingOptOut || run.user.isBlocked) {
        await db.emailAutomationRun.update({
          where: { id: run.id },
          data: { status: "cancelled" },
        });
        cancelled++;
        continue;
      }

      const steps = (run.automation.steps as AutomationStep[] | null) ?? [];
      const step = steps[run.currentStep];
      if (!step) {
        await db.emailAutomationRun.update({
          where: { id: run.id },
          data: { status: "failed", completedAt: now },
        });
        failed++;
        continue;
      }

      const stepType = getStepType(step);

      // --- Condition step: проверка взаимодействия с прошлым письмом ---
      if (stepType === "condition") {
        const cond = step as ConditionStep;
        const refIdx = cond.referenceStepIndex ?? run.currentStep - 1;
        const refRecipientId = `auto:${run.id}:${refIdx}`;
        const cutoff = new Date(now.getTime() - cond.withinHours * 60 * 60 * 1000);
        const event = await db.emailEvent.findFirst({
          where: {
            recipientId: refRecipientId,
            type: cond.metric,
            occurredAt: { gte: cutoff },
          },
          select: { id: true },
        });
        const conditionMet = !!event;
        const nextStepIdx = conditionMet
          ? run.currentStep + 1
          : run.currentStep + 1 + Math.max(0, cond.skipStepsIfFalse);

        if (nextStepIdx >= steps.length) {
          await db.emailAutomationRun.update({
            where: { id: run.id },
            data: { status: "completed", completedAt: now, currentStep: nextStepIdx },
          });
          completed++;
        } else {
          // Идём сразу — с нулевым delay, чтобы следующий tick обработал.
          await db.emailAutomationRun.update({
            where: { id: run.id },
            data: {
              currentStep: nextStepIdx,
              nextStepAt: now,
              attemptCount: 0,
              lastError: null,
            },
          });
        }
        continue;
      }

      // --- Exit-on-event step: проверка трекаемых событий, останов если найдено ---
      if (stepType === "exit_on_event") {
        const exitStep = step as ExitStep;
        const sinceTime = exitStep.withinHoursSinceStart
          ? new Date(now.getTime() - exitStep.withinHoursSinceStart * 60 * 60 * 1000)
          : run.startedAt;

        let exitTriggered = false;
        for (const evt of exitStep.events) {
          if (evt === "order.paid") {
            const order = await db.order.findFirst({
              where: { userId: run.userId, status: "paid", createdAt: { gte: sinceTime } },
              select: { id: true },
            });
            if (order) {
              exitTriggered = true;
              break;
            }
          } else {
            const type = evt.replace("email.", "");
            const ev = await db.emailEvent.findFirst({
              where: { userId: run.userId, type, occurredAt: { gte: sinceTime } },
              select: { id: true },
            });
            if (ev) {
              exitTriggered = true;
              break;
            }
          }
        }

        if (exitTriggered) {
          await db.emailAutomationRun.update({
            where: { id: run.id },
            data: { status: "completed", completedAt: now },
          });
          completed++;
        } else {
          await db.emailAutomationRun.update({
            where: { id: run.id },
            data: {
              currentStep: run.currentStep + 1,
              nextStepAt: now,
              attemptCount: 0,
              lastError: null,
            },
          });
        }
        continue;
      }

      // --- Email step ---
      const emailStep = step as EmailStep;
      if (!emailStep.templateId) {
        await db.emailAutomationRun.update({
          where: { id: run.id },
          data: { status: "failed", completedAt: now },
        });
        failed++;
        continue;
      }

      // Достаём шаблон.
      const template = await db.emailVisualTemplate.findUnique({
        where: { id: emailStep.templateId },
        select: { id: true, subject: true, compiledHtml: true, isArchived: true },
      });
      if (!template || template.isArchived) {
        // Шаблон удалён или архивирован — не можем отправить шаг.
        await db.emailAutomationRun.update({
          where: { id: run.id },
          data: { status: "failed", completedAt: now },
        });
        failed++;
        continue;
      }

      // Подставляем переменные + tracking.
      // recipientId формируем стабильно: {runId}-{stepIndex} — это попадает
      // в EmailEvent.recipientId и сохраняется идентичность для дедупа.
      const recipientId = `auto:${run.id}:${run.currentStep}`;
      const html = applyVariablesAndTracking({
        html: template.compiledHtml,
        variables: {
          firstName: extractFirstName(run.user.fullName),
          fullName: run.user.fullName ?? "",
          email: run.user.email,
          automationName: run.automation.name,
        },
        recipientId,
        unsubscribeToken: run.user.unsubscribeToken ?? undefined,
      });

      try {
        const sendResult = await provider.sendOne({
          to: run.user.email,
          subject: template.subject,
          html,
          fromName,
          fromEmail,
          recipientId,
          headers: {
            "X-Automation-Id": run.automation.id,
            "X-Automation-Run-Id": run.id,
            "X-Automation-Step": String(run.currentStep),
          },
        });

        // Запись EmailEvent — попадает в карточку контакта и счётчики dashboard.
        await db.emailEvent.create({
          data: {
            userId: run.userId,
            email: run.user.email,
            recipientId,
            type: "sent",
            providerEventId: sendResult.providerMessageId
              ? `local:auto:${sendResult.providerMessageId}`
              : null,
            metadata: {
              automationId: run.automation.id,
              automationRunId: run.id,
              stepIndex: run.currentStep,
            },
          },
        });

        stepsSent++;
      } catch (sendError) {
        // Retry-policy: transient ошибка → ставим nextStepAt с backoff,
        // currentStep не двигаем (попробуем тот же шаг). После MAX_ATTEMPTS
        // или permanent кода — failed.
        const kind = classifyError(sendError);
        const message = sendError instanceof Error ? sendError.message : String(sendError);
        const newAttempt = run.attemptCount + 1;

        if (kind === "permanent" || newAttempt >= MAX_ATTEMPTS) {
          console.error(
            `[automation] run ${run.id} step ${run.currentStep} failed permanently (attempt ${newAttempt}):`,
            message
          );
          await db.emailAutomationRun.update({
            where: { id: run.id },
            data: {
              status: "failed",
              completedAt: now,
              attemptCount: newAttempt,
              lastError: message.slice(0, 500),
            },
          });
          failed++;
        } else {
          const nextAt = computeNextAttempt(newAttempt, now) ?? now;
          console.warn(
            `[automation] run ${run.id} step ${run.currentStep} transient (attempt ${newAttempt}), retry at ${nextAt.toISOString()}:`,
            message
          );
          await db.emailAutomationRun.update({
            where: { id: run.id },
            data: {
              attemptCount: newAttempt,
              nextStepAt: nextAt,
              lastError: message.slice(0, 500),
            },
          });
        }
        continue;
      }

      // Продвигаем run. attemptCount сбрасываем — счётчик per-step.
      const nextStepIdx = run.currentStep + 1;
      if (nextStepIdx >= steps.length) {
        await db.emailAutomationRun.update({
          where: { id: run.id },
          data: {
            status: "completed",
            completedAt: now,
            currentStep: nextStepIdx,
            attemptCount: 0,
            lastError: null,
          },
        });
        completed++;
      } else {
        const nextDelay = getStepDelay(steps[nextStepIdx]);
        await db.emailAutomationRun.update({
          where: { id: run.id },
          data: {
            currentStep: nextStepIdx,
            attemptCount: 0,
            lastError: null,
            nextStepAt: new Date(now.getTime() + nextDelay * 60 * 60 * 1000),
          },
        });
      }

      // Обновляем агрегаты автоматизации (для UI списка).
      const stats =
        (run.automation.stats as Record<string, number> | null) ?? {};
      await db.emailAutomation.update({
        where: { id: run.automation.id },
        data: {
          stats: {
            ...stats,
            stepsSent: (stats.stepsSent ?? 0) + 1,
            ...(nextStepIdx >= steps.length
              ? { completedRuns: (stats.completedRuns ?? 0) + 1 }
              : {}),
          },
        },
      });
    } catch (e) {
      console.error(`[automation] run ${run.id} failed:`, e);
      await db.emailAutomationRun.update({
        where: { id: run.id },
        data: { status: "failed", completedAt: now },
      });
      failed++;
    }
  }

  return { processed: runs.length, stepsSent, cancelled, completed, failed };
}
