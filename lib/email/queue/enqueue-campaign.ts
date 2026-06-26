import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import {
  compileSegmentFilters,
  parseSegmentFilters,
} from "@/lib/email/segments/compile-filters";
import { extractFirstName } from "@/lib/email/compiler/variables";
import { assignVariant, parseAbTestConfig } from "@/lib/email/queue/ab-test";

/**
 * Создаёт EmailDeliveryJob записи для всех получателей кампании.
 *
 * Алгоритм:
 *   1. Получить сегмент кампании, скомпилировать фильтры.
 *   2. Дополнительно отфильтровать: marketingOptOut=false, email НЕ пустой.
 *   3. Сделать пачку INSERT-ов по batchSize. Дубли отбрасываются на уровне
 *      БД через UNIQUE(campaignId, userId) — это race-safe.
 *   4. В конце ставит EmailCampaign.enqueueComplete=true и обновляет stats.
 *
 * Идемпотентность: при повторном вызове createMany бросит unique violation
 * для уже созданных пар, skipDuplicates её ловит — итого вторая попытка не
 * создаёт дублей. Безопасно вызывать сколько угодно раз.
 *
 * Не отправляет письма — только наполняет очередь. Реальная доставка — в
 * processDueDeliveryJobs() через cron-tick.
 */

const ENQUEUE_BATCH_SIZE = 500;

export interface EnqueueResult {
  recipients: number;
  enqueued: number;
  skipped: number;
}

export async function enqueueCampaign(campaignId: string): Promise<EnqueueResult> {
  const campaign = await db.emailCampaign.findUnique({
    where: { id: campaignId },
    select: {
      id: true,
      segmentId: true,
      status: true,
      templateId: true,
      enqueueComplete: true,
      abTest: true,
    },
  });
  if (!campaign) throw new Error(`Campaign ${campaignId} not found`);
  if (!campaign.templateId) throw new Error(`Campaign ${campaignId} has no template`);
  if (campaign.enqueueComplete) {
    return { recipients: 0, enqueued: 0, skipped: 0 };
  }
  const abTest = parseAbTestConfig(campaign.abTest);

  let segmentWhere: Prisma.UserWhereInput = {};
  if (campaign.segmentId) {
    const segment = await db.emailSegment.findUnique({
      where: { id: campaign.segmentId },
      select: { filters: true },
    });
    if (!segment) throw new Error(`Segment ${campaign.segmentId} not found`);
    const filters = parseSegmentFilters(segment.filters);
    segmentWhere = compileSegmentFilters(filters);
  } else {
    throw new Error(`Campaign ${campaignId} has no segment`);
  }

  const where: Prisma.UserWhereInput = {
    AND: [
      segmentWhere,
      { marketingOptOut: false },
      { isBlocked: false },
      { email: { not: "" } },
    ],
  };

  let totalRecipients = 0;
  let totalEnqueued = 0;
  let totalSkipped = 0;
  let cursor: string | undefined;

  for (;;) {
    const batch = await db.user.findMany({
      where,
      orderBy: { id: "asc" },
      take: ENQUEUE_BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        email: true,
        fullName: true,
      },
    });
    if (batch.length === 0) break;

    totalRecipients += batch.length;

    // UNIQUE(campaignId, userId) в БД делает skipDuplicates атомарным.
    // Дубли от повторного enqueue / параллельного процесса просто отвалятся
    // на этапе INSERT — не нужны check-then-act manual filters.
    const result = await db.emailDeliveryJob.createMany({
      data: batch.map((u) => {
        const abVariantIdx = abTest ? assignVariant(abTest, u.id, campaignId) : undefined;
        return {
          campaignId,
          userId: u.id,
          email: u.email,
          // A/B-holdout стартует как "cancelled" — processDueDeliveryJobs его
          // не возьмёт. processAbWinners после winnerAfterHours перевернёт
          // обратно в "pending" с выставленным winnerVariantIdx.
          status: abVariantIdx === "holdout" ? "cancelled" : "pending",
          variables: {
            firstName: extractFirstName(u.fullName),
            fullName: u.fullName ?? "",
            email: u.email,
            ...(abVariantIdx !== undefined ? { abVariantIdx } : {}),
          },
        };
      }),
      skipDuplicates: true,
    });
    totalEnqueued += result.count;
    totalSkipped += batch.length - result.count;

    cursor = batch[batch.length - 1].id;
    if (batch.length < ENQUEUE_BATCH_SIZE) break;
  }

  // Финализируем. enqueueComplete=true разрешает processFinishedCampaigns
  // переводить кампанию в "sent" когда все jobs обработаны.
  const currentStats = await db.emailCampaign.findUnique({
    where: { id: campaignId },
    select: { stats: true },
  });
  const stats = (currentStats?.stats as Record<string, number> | null) ?? {};
  await db.emailCampaign.update({
    where: { id: campaignId },
    data: {
      enqueueComplete: true,
      stats: {
        ...stats,
        recipients: totalRecipients,
        enqueued: (stats.enqueued ?? 0) + totalEnqueued,
      },
    },
  });

  return {
    recipients: totalRecipients,
    enqueued: totalEnqueued,
    skipped: totalSkipped,
  };
}
