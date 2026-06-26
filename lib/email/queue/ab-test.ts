import { createHash } from "crypto";

/**
 * A/B сплит-тест для маркетинговых кампаний.
 *
 * Концепция: вместо одного письма маркетолог задаёт 2 варианта (разные subject
 * или fromName), система отправляет N% базы на каждый вариант, через
 * winnerAfterHours считает open rate / click rate, оставшийся holdout
 * получает победителя.
 *
 * Архитектура:
 *   - EmailCampaign.abTest Json хранит конфиг и результаты:
 *       {
 *         enabled: boolean,
 *         variants: [{ subject, fromName?, sharePercent }],
 *         winnerMetric: 'opened' | 'clicked',
 *         winnerAfterHours: number,
 *         winnerVariantIdx?: number,    // выставляется processAbWinners
 *         winnerDecidedAt?: ISO,
 *       }
 *   - При enqueueCampaign каждый EmailDeliveryJob получает
 *     variables.abVariantIdx: 0 | 1 | 'holdout'.
 *   - processDueDeliveryJobs:
 *       - variantIdx=0|1 → отправляем сразу со своим subject
 *       - variantIdx="holdout" — пропускаем пока winner не определён
 *   - processAbWinners после winnerAfterHours считает метрики per-variant,
 *     ставит winnerVariantIdx, переводит holdout-jobs в pending с
 *     variantIdx=winner.
 *
 * Hash bucket: hash(userId + campaignId) % 100 — стабильный, идемпотентный.
 * Перезапуск enqueue даст тот же variantIdx для того же юзера.
 *
 * Ограничения:
 *   - Поддерживаются 2 варианта (A/B). Multi-variate (A/B/C/D) — позже.
 *   - В bulk-режиме (Unisender createCampaign) A/B не работает: один subject
 *     на createCampaign. Wizard это отображает и предлагает Yandex SMTP.
 */

export interface AbTestVariant {
  subject: string;
  fromName?: string;
  sharePercent: number;
}

export interface AbTestConfig {
  enabled?: boolean;
  variants?: AbTestVariant[];
  winnerMetric?: "opened" | "clicked";
  winnerAfterHours?: number;
  winnerVariantIdx?: number;
  winnerDecidedAt?: string;
}

export type AbVariantAssignment = number | "holdout";

/**
 * Возвращает variantIdx для пользователя. Стабильный hash, не зависит от
 * порядка вызовов — повторный enqueue распределит юзеров одинаково.
 */
export function assignVariant(
  config: AbTestConfig,
  userId: string,
  campaignId: string
): AbVariantAssignment {
  if (!config.enabled || !config.variants || config.variants.length === 0) {
    return 0;
  }
  const hash = createHash("sha256").update(`${userId}:${campaignId}`).digest();
  // Берём первые 4 байта → bucket 0..99.
  const bucket = hash.readUInt32BE(0) % 100;

  let acc = 0;
  for (let i = 0; i < config.variants.length; i++) {
    acc += config.variants[i].sharePercent;
    if (bucket < acc) return i;
  }
  return "holdout";
}

/**
 * Эффективный subject/fromName для конкретного job, с учётом winnerVariantIdx
 * после определения победителя.
 *
 * @param baseSubject — campaign.subject (используется если abTest выключен)
 * @param baseFromName — campaign.fromName
 */
export function resolveAbEffectiveCopy(
  config: AbTestConfig | null | undefined,
  assignment: AbVariantAssignment | null | undefined,
  baseSubject: string,
  baseFromName: string
): { subject: string; fromName: string } {
  if (!config?.enabled || !config.variants || config.variants.length === 0) {
    return { subject: baseSubject, fromName: baseFromName };
  }

  let idx: number | null = null;
  if (typeof assignment === "number") {
    idx = assignment;
  } else if (assignment === "holdout" && typeof config.winnerVariantIdx === "number") {
    idx = config.winnerVariantIdx;
  }

  if (idx !== null && idx >= 0 && idx < config.variants.length) {
    const v = config.variants[idx];
    return {
      subject: v.subject || baseSubject,
      fromName: v.fromName || baseFromName,
    };
  }

  return { subject: baseSubject, fromName: baseFromName };
}

export function parseAbTestConfig(raw: unknown): AbTestConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (!obj.enabled) return null;
  if (!Array.isArray(obj.variants) || obj.variants.length === 0) return null;
  return obj as AbTestConfig;
}

/**
 * Валидация суммы sharePercent + другие правила. Используется в API.
 */
export function validateAbTestConfig(config: AbTestConfig): { ok: true } | { ok: false; reason: string } {
  if (!config.variants || config.variants.length < 2) {
    return { ok: false, reason: "Минимум 2 варианта" };
  }
  if (config.variants.length > 4) {
    return { ok: false, reason: "Максимум 4 варианта" };
  }
  for (let i = 0; i < config.variants.length; i++) {
    const v = config.variants[i];
    if (!v.subject || v.subject.trim().length === 0) {
      return { ok: false, reason: `Subject варианта ${i + 1} пустой` };
    }
    if (typeof v.sharePercent !== "number" || v.sharePercent < 1 || v.sharePercent > 50) {
      return { ok: false, reason: `Доля варианта ${i + 1} вне 1-50%` };
    }
  }
  const sum = config.variants.reduce((a, v) => a + v.sharePercent, 0);
  if (sum >= 100) {
    return { ok: false, reason: "Сумма долей вариантов должна быть < 100% (остаток ждёт победителя)" };
  }
  if (!["opened", "clicked"].includes(config.winnerMetric ?? "opened")) {
    return { ok: false, reason: "winnerMetric должна быть opened или clicked" };
  }
  if (
    typeof config.winnerAfterHours !== "number" ||
    config.winnerAfterHours < 1 ||
    config.winnerAfterHours > 168
  ) {
    return { ok: false, reason: "winnerAfterHours должна быть 1-168 часов (до недели)" };
  }
  return { ok: true };
}
