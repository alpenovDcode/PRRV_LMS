import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { getMarketingEmailProvider } from "@/lib/email/providers/factory";
import { applyVariablesAndTracking } from "@/lib/email/compiler/variables";
import { computeNextAttempt, classifyError, MAX_ATTEMPTS } from "./retry-policy";
import { enqueueCampaign } from "./enqueue-campaign";
import { bulkRunCampaign } from "./bulk-run-campaign";
import {
  parseAbTestConfig,
  resolveAbEffectiveCopy,
  type AbVariantAssignment,
} from "./ab-test";

/**
 * Воркер отправки email-кампаний. Дёргается из /api/email-cron/tick раз в 10 сек.
 *
 * За один tick делает четыре задачи:
 *
 * 1. processDueScheduledCampaigns()
 *      Кампании со status="scheduled" и scheduledAt <= NOW переводятся в "sending".
 *      Дальше — обычный жизненный цикл.
 *
 * 2. processPendingEnqueues()
 *      Кампании в "sending" + tokensReady=true + enqueueComplete=false →
 *      запускаем enqueueCampaign (создаём EmailDeliveryJob). По одной кампании
 *      за tick — для 70K это занимает ~30 сек, не хочется блокировать тик надолго.
 *
 * 3. processDueDeliveryJobs()
 *      Берём батч EmailDeliveryJob со status in (pending, retrying) и
 *      next_attempt_at <= NOW, АТОМАРНО клеймим в status="sending", шлём через
 *      провайдер. Это защищает от двойной отправки при параллельных tick'ах.
 *
 * 4. processFinishedCampaigns()
 *      Кампании в "sending" с enqueueComplete=true где нет оставшихся
 *      pending/retrying/sending джобов → переводим в "sent".
 *
 * Все этапы независимы. Ошибка одного не валит другие. Каждая запись
 * EmailDeliveryJob независима — упавший SMTP-запрос не блокирует следующий.
 */

const BATCH_SIZE = 100;
const CLAIM_TIMEOUT_MS = 5 * 60 * 1000; // 5 минут — потом sending → retrying

export interface ProcessResult {
  scheduledStarted: number;
  enqueuesRun: number;
  jobsProcessed: number;
  jobsSent: number;
  jobsFailed: number;
  campaignsFinished: number;
  orphanReclaimed: number;
}

/**
 * Кампании со scheduledAt <= now переходят в "sending". Реальный enqueue
 * сделает processPendingEnqueues в следующих фазах (или этом же тике).
 */
export async function processDueScheduledCampaigns(now: Date = new Date()): Promise<number> {
  const due = await db.emailCampaign.findMany({
    where: {
      status: "scheduled",
      scheduledAt: { lte: now },
    },
    select: { id: true },
    take: 10,
  });

  let started = 0;
  for (const c of due) {
    try {
      const result = await db.emailCampaign.updateMany({
        where: { id: c.id, status: "scheduled" },
        data: { status: "sending", startedAt: now },
      });
      if (result.count > 0) started++;
    } catch (e) {
      console.error(`[email-cron] failed to start scheduled campaign ${c.id}:`, e);
    }
  }
  return started;
}

/**
 * Запускает enqueueCampaign (или bulkRunCampaign — для Unisender createCampaign)
 * для одной кампании за tick. После генерации токенов (tokensReady=true) и
 * до завершения enqueue (enqueueComplete=false).
 *
 * Развилка:
 *   - provider.sendBulkCampaign есть (Unisender) → bulk-режим: контакты
 *     синхронизируются в провайдер, кампания запускается у них, мы только
 *     polling'ом обновляем статистику.
 *   - иначе (Yandex SMTP) → per-email через нашу очередь EmailDeliveryJob.
 */
export async function processPendingEnqueues(): Promise<number> {
  const campaign = await db.emailCampaign.findFirst({
    where: {
      status: "sending",
      tokensReady: true,
      enqueueComplete: false,
    },
    orderBy: { startedAt: "asc" },
    select: { id: true },
  });

  if (!campaign) return 0;

  const provider = getMarketingEmailProvider();
  const isBulkMode =
    typeof provider.sendBulkCampaign === "function" &&
    typeof provider.syncContactsBatch === "function";

  try {
    if (isBulkMode) {
      await bulkRunCampaign(campaign.id);
    } else {
      await enqueueCampaign(campaign.id);
    }
    return 1;
  } catch (e) {
    console.error(`[email-cron] enqueue failed for campaign ${campaign.id}:`, e);
    return 0;
  }
}

/**
 * Polling статистики bulk-кампаний (variant B / Unisender createCampaign).
 *
 * Для всех sending-кампаний с providerCampaignId:
 *   - Опрашиваем provider.getCampaignStats
 *   - Мерджим в EmailCampaign.stats
 *   - Если status="sent" у провайдера → переводим в "sent" у нас.
 *
 * Идёт раз в tick — это OK, getCampaignAggregateStats у Unisender дешёвый.
 * Для масштаба ограничиваем 20 кампаний за tick.
 */
export async function processBulkPolling(): Promise<number> {
  const provider = getMarketingEmailProvider();
  if (typeof provider.getCampaignStats !== "function") return 0;

  const campaigns = await db.emailCampaign.findMany({
    where: {
      status: "sending",
      providerCampaignId: { not: null },
    },
    select: { id: true, providerCampaignId: true, stats: true },
    orderBy: { startedAt: "asc" },
    take: 20,
  });

  let polled = 0;
  for (const c of campaigns) {
    if (!c.providerCampaignId) continue;
    try {
      const remote = await provider.getCampaignStats(c.providerCampaignId);
      const localStats = (c.stats as Record<string, number | string> | null) ?? {};
      const merged: Record<string, number | string> = { ...localStats };
      if (remote.recipients !== undefined) merged.recipients = remote.recipients;
      if (remote.delivered !== undefined) merged.delivered = remote.delivered;
      if (remote.opened !== undefined) merged.opened = remote.opened;
      if (remote.clicked !== undefined) merged.clicked = remote.clicked;
      if (remote.bounced !== undefined) merged.bounced = remote.bounced;
      if (remote.spam !== undefined) merged.spam = remote.spam;
      if (remote.unsubscribed !== undefined) merged.unsubscribed = remote.unsubscribed;

      const data: Record<string, unknown> = { stats: merged };
      if (remote.status === "sent") {
        data.status = "sent";
        data.finishedAt = new Date();
      } else if (remote.status === "cancelled" || remote.status === "failed") {
        data.status = remote.status;
        data.finishedAt = new Date();
      }

      await db.emailCampaign.update({ where: { id: c.id }, data });
      polled++;
    } catch (e) {
      console.error(`[email-cron] bulk polling failed for ${c.id}:`, e);
    }
  }

  return polled;
}

/**
 * Резурекция: orphan jobs застрявшие в status="sending" дольше CLAIM_TIMEOUT_MS
 * возвращаются в "retrying". Это случается если воркер крашится после claim,
 * но до записи финального статуса. Без этого они залипали бы навсегда.
 */
async function reclaimOrphanSending(now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - CLAIM_TIMEOUT_MS);
  const result = await db.emailDeliveryJob.updateMany({
    where: {
      status: "sending",
      updatedAt: { lte: cutoff },
    },
    data: {
      status: "retrying",
      nextAttemptAt: now,
    },
  });
  return result.count;
}

interface DeliveryStats {
  jobsProcessed: number;
  jobsSent: number;
  jobsFailed: number;
  orphanReclaimed: number;
}

export async function processDueDeliveryJobs(now: Date = new Date()): Promise<DeliveryStats> {
  const orphanReclaimed = await reclaimOrphanSending(now);

  // 1) Берём кандидатов на отправку. SELECT может пересекаться с другим
  // tick'ом — мы это решаем атомарным UPDATE на шаге 2.
  // Кампании с providerCampaignId (bulk-режим, Unisender) пропускаем —
  // отправку делает провайдер, мы только polling статистики.
  const candidates = await db.emailDeliveryJob.findMany({
    where: {
      status: { in: ["pending", "retrying"] },
      nextAttemptAt: { lte: now },
      campaign: { status: "sending", providerCampaignId: null },
    },
    orderBy: { nextAttemptAt: "asc" },
    take: BATCH_SIZE,
    select: { id: true },
  });

  if (candidates.length === 0) {
    return { jobsProcessed: 0, jobsSent: 0, jobsFailed: 0, orphanReclaimed };
  }

  // 2) АТОМАРНЫЙ claim: меняем status pending/retrying → sending. Postgres
  // делает UPDATE с WHERE-фильтром одним стейтментом — параллельный воркер,
  // зацепивший те же id, получит count<candidates.length, мы возьмём только
  // ровно claimedCount строк. Race-safe.
  const claimResult = await db.emailDeliveryJob.updateMany({
    where: {
      id: { in: candidates.map((c) => c.id) },
      status: { in: ["pending", "retrying"] },
    },
    data: { status: "sending" },
  });

  if (claimResult.count === 0) {
    return { jobsProcessed: 0, jobsSent: 0, jobsFailed: 0, orphanReclaimed };
  }

  // 3) Достаём claimed jobs с полным контекстом. Берём только status=sending
  // и только id из candidates — другие могли быть подобраны нашим же
  // reclaimOrphanSending или другим воркером ранее.
  const jobs = await db.emailDeliveryJob.findMany({
    where: {
      id: { in: candidates.map((c) => c.id) },
      status: "sending",
    },
    include: {
      campaign: {
        select: {
          id: true,
          fromName: true,
          fromEmail: true,
          subject: true,
          status: true,
          abTest: true,
          template: { select: { compiledHtml: true } },
        },
      },
      user: { select: { unsubscribeToken: true } },
    },
  });

  const provider = getMarketingEmailProvider();
  let sent = 0;
  let failed = 0;
  const touchedCampaigns = new Set<string>();

  for (const job of jobs) {
    // Pause-aware: если кампания была поставлена на pause/cancel между claim
    // и нашей очередью отправки — откатываем job в pending, не шлём.
    if (job.campaign.status !== "sending") {
      await db.emailDeliveryJob.update({
        where: { id: job.id },
        data: { status: job.campaign.status === "paused" ? "pending" : "cancelled" },
      });
      continue;
    }

    const tpl = job.campaign.template;
    if (!tpl) {
      await markJobFailed(job.id, "Template missing", now, job.email, job.campaignId);
      failed++;
      touchedCampaigns.add(job.campaign.id);
      continue;
    }

    try {
      const variables = (job.variables as Record<string, string | number | null>) ?? {};
      const html = applyVariablesAndTracking({
        html: tpl.compiledHtml,
        variables,
        recipientId: job.id,
        unsubscribeToken: job.user?.unsubscribeToken ?? undefined,
      });

      // A/B: вычисляем effective subject/fromName в зависимости от variantIdx
      // из variables. Holdout-jobs к этой точке уже имеют winnerVariantIdx
      // (их status вернули в pending только после определения победителя).
      const abConfig = parseAbTestConfig(job.campaign.abTest);
      const assignment = (variables.abVariantIdx as AbVariantAssignment | undefined) ?? null;
      const { subject, fromName } = resolveAbEffectiveCopy(
        abConfig,
        assignment,
        job.campaign.subject,
        job.campaign.fromName
      );

      const result = await provider.sendOne({
        to: job.email,
        subject,
        html,
        fromName,
        fromEmail: job.campaign.fromEmail,
        recipientId: job.id,
        headers: {
          "X-Campaign-Id": job.campaign.id,
          "X-Recipient-Id": job.id,
          ...(typeof assignment === "number" ? { "X-AB-Variant": String(assignment) } : {}),
        },
      });

      await db.$transaction([
        db.emailDeliveryJob.update({
          where: { id: job.id },
          data: {
            status: "sent",
            sentAt: now,
            attemptCount: job.attemptCount + 1,
            providerMessageId: result.providerMessageId ?? null,
            lastError: null,
          },
        }),
        db.emailEvent.create({
          data: {
            userId: job.userId,
            email: job.email,
            campaignId: job.campaign.id,
            recipientId: job.id,
            type: "sent",
            providerEventId: result.providerMessageId
              ? `local:sent:${result.providerMessageId}`
              : null,
          },
        }),
      ]);

      sent++;
    } catch (error) {
      const kind = classifyError(error);
      const message = error instanceof Error ? error.message : String(error);
      const newAttempt = job.attemptCount + 1;

      if (kind === "permanent" || newAttempt >= MAX_ATTEMPTS) {
        await markJobFailed(job.id, message, now, job.email, job.campaignId, newAttempt);
        failed++;
      } else {
        const nextAt = computeNextAttempt(newAttempt, now) ?? now;
        await db.emailDeliveryJob.update({
          where: { id: job.id },
          data: {
            status: "retrying",
            attemptCount: newAttempt,
            nextAttemptAt: nextAt,
            lastError: message.slice(0, 500),
          },
        });
      }
    }
    touchedCampaigns.add(job.campaign.id);
  }

  for (const cid of touchedCampaigns) {
    await updateCampaignStats(cid);
  }

  return { jobsProcessed: jobs.length, jobsSent: sent, jobsFailed: failed, orphanReclaimed };
}

/**
 * Отмечает job как failed и пишет EmailEvent type=bounced. Принимает email и
 * campaignId явно — без дополнительных findUnique после update.
 */
async function markJobFailed(
  jobId: string,
  message: string,
  now: Date,
  email: string,
  campaignId: string,
  attemptCount?: number
) {
  await db.$transaction([
    db.emailDeliveryJob.update({
      where: { id: jobId },
      data: {
        status: "failed",
        lastError: message.slice(0, 500),
        ...(attemptCount !== undefined ? { attemptCount } : {}),
        sentAt: null,
      },
    }),
    db.emailEvent.create({
      data: {
        email,
        campaignId,
        recipientId: jobId,
        type: "bounced",
        occurredAt: now,
        metadata: { source: "send_failure", error: message.slice(0, 200) },
      },
    }),
  ]);
}

async function updateCampaignStats(campaignId: string) {
  const [sentCount, failedCount, pendingCount] = await Promise.all([
    db.emailDeliveryJob.count({ where: { campaignId, status: "sent" } }),
    db.emailDeliveryJob.count({ where: { campaignId, status: "failed" } }),
    db.emailDeliveryJob.count({
      where: { campaignId, status: { in: ["pending", "retrying", "sending"] } },
    }),
  ]);

  const campaign = await db.emailCampaign.findUnique({
    where: { id: campaignId },
    select: { stats: true },
  });
  const stats = (campaign?.stats as Record<string, number> | null) ?? {};
  await db.emailCampaign.update({
    where: { id: campaignId },
    data: {
      stats: {
        ...stats,
        sent: sentCount,
        failed: failedCount,
        pending: pendingCount,
      },
    },
  });
}

/**
 * Финиширует кампанию ТОЛЬКО когда:
 *   1. enqueueComplete=true — иначе enqueue ещё работает и pending=0 врёт.
 *   2. Нет оставшихся pending/retrying/sending джобов.
 *
 * Bulk-кампании (Unisender createCampaign) пропускаем — их финиш ставит
 * processBulkPolling по статусу провайдера.
 */
export async function processFinishedCampaigns(now: Date = new Date()): Promise<number> {
  const candidates = await db.emailCampaign.findMany({
    where: {
      status: "sending",
      enqueueComplete: true,
      providerCampaignId: null,
    },
    select: { id: true },
    take: 50,
  });

  let finished = 0;
  for (const c of candidates) {
    const remaining = await db.emailDeliveryJob.count({
      where: {
        campaignId: c.id,
        status: { in: ["pending", "retrying", "sending"] },
      },
    });
    if (remaining > 0) continue;

    await db.emailCampaign.update({
      where: { id: c.id },
      data: { status: "sent", finishedAt: now },
    });
    finished++;
  }
  return finished;
}

/**
 * Главный объединитель — вызывается из /api/email-cron/tick.
 */
export async function processCampaigns(
  now: Date = new Date()
): Promise<ProcessResult & { bulkPolled: number; abWinnersDecided: number }> {
  const scheduledStarted = await processDueScheduledCampaigns(now);
  const enqueuesRun = await processPendingEnqueues();
  const delivery = await processDueDeliveryJobs(now);
  const bulkPolled = await processBulkPolling();
  const abWinnersDecided = await processAbWinners(now);
  const campaignsFinished = await processFinishedCampaigns(now);

  return {
    scheduledStarted,
    enqueuesRun,
    jobsProcessed: delivery.jobsProcessed,
    jobsSent: delivery.jobsSent,
    jobsFailed: delivery.jobsFailed,
    campaignsFinished,
    orphanReclaimed: delivery.orphanReclaimed,
    bulkPolled,
    abWinnersDecided,
  };
}

/**
 * A/B winner decision: для кампаний с включённым A/B-тестом и истёкшим
 * winnerAfterHours считаем метрики per-variant, выбираем победителя,
 * освобождаем holdout-джобы (cancelled → pending) с привязкой к winner.
 */
export async function processAbWinners(now: Date = new Date()): Promise<number> {
  const candidates = await db.emailCampaign.findMany({
    where: {
      status: "sending",
      enqueueComplete: true,
      abTest: { not: Prisma.JsonNull },
    },
    select: {
      id: true,
      startedAt: true,
      abTest: true,
    },
    take: 20,
  });

  let decided = 0;
  for (const c of candidates) {
    const config = parseAbTestConfig(c.abTest);
    if (!config || !config.variants) continue;
    if (typeof config.winnerVariantIdx === "number") continue; // уже определён
    if (!c.startedAt) continue;
    const dueAt = new Date(
      c.startedAt.getTime() + (config.winnerAfterHours ?? 4) * 60 * 60 * 1000
    );
    if (now < dueAt) continue;

    // Подсчёт метрики per variantIdx через EmailEvent.metadata.abVariantIdx —
    // мы пишем variantIdx в EmailDeliveryJob.variables; для подсчёта удобнее
    // взять из метаданных EmailEvent (где providerEventId уже dedup'нут).
    // Минимизируем round-trip: один SELECT с группировкой по variantIdx.
    const metric = config.winnerMetric ?? "opened";
    const stats: Record<number, number> = {};
    for (let i = 0; i < config.variants.length; i++) stats[i] = 0;

    // Считаем уникальные recipientId per variantIdx (open dedup уже сделан).
    // SELECT через raw — Prisma не умеет group by на JSON-поле.
    // Альтернатива: пройтись по EmailDeliveryJob кампании, join EmailEvent
    // type=metric, group by variantIdx из job.variables. Это N+1 для каждого
    // job → используем raw SQL.
    const rows = await db.$queryRaw<Array<{ variant_idx: number; cnt: bigint }>>`
      SELECT (j.variables->>'abVariantIdx')::int AS variant_idx, COUNT(DISTINCT e.recipient_id) AS cnt
      FROM email_delivery_jobs j
      LEFT JOIN email_events e ON e.recipient_id = j.id AND e.type = ${metric}
      WHERE j.campaign_id = ${c.id}
        AND j.variables->>'abVariantIdx' IS NOT NULL
        AND j.variables->>'abVariantIdx' != 'holdout'
      GROUP BY (j.variables->>'abVariantIdx')::int
    `;

    for (const row of rows) {
      stats[row.variant_idx] = Number(row.cnt);
    }

    let winnerIdx = 0;
    let winnerCnt = stats[0];
    for (let i = 1; i < config.variants.length; i++) {
      if (stats[i] > winnerCnt) {
        winnerIdx = i;
        winnerCnt = stats[i];
      }
    }

    const updatedConfig = {
      ...config,
      winnerVariantIdx: winnerIdx,
      winnerDecidedAt: now.toISOString(),
      variantStats: stats,
    };

    await db.$transaction([
      db.emailCampaign.update({
        where: { id: c.id },
        data: { abTest: updatedConfig as unknown as Prisma.InputJsonValue },
      }),
      // Освобождаем holdout: status cancelled → pending. Не обновляем
      // variables.abVariantIdx — resolveAbEffectiveCopy при отправке сам
      // подхватит winnerVariantIdx из config.
      db.emailDeliveryJob.updateMany({
        where: {
          campaignId: c.id,
          status: "cancelled",
        },
        data: { status: "pending", nextAttemptAt: now },
      }),
    ]);

    decided++;
  }

  return decided;
}
