import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import {
  compileSegmentFilters,
  parseSegmentFilters,
} from "@/lib/email/segments/compile-filters";
import { extractFirstName, applyVariablesAndTracking } from "@/lib/email/compiler/variables";
import { getMarketingEmailProvider } from "@/lib/email/providers/factory";
import type { SyncContact } from "@/lib/email/providers/types";

/**
 * Bulk-режим запуска маркетинговой кампании.
 *
 * Активируется когда у текущего провайдера есть метод sendBulkCampaign
 * (Unisender; Yandex SMTP — нет). Поток:
 *
 *   1. Стримим получателей сегмента (как в enqueueCampaign).
 *   2. Создаём EmailDeliveryJob (status="sent") — нужны для:
 *        - per-recipient метрик в дашборде
 *        - резолва recipientId в webhook'ах от провайдера (по email)
 *        - возможности view-in-browser на наш домен
 *   3. Параллельно собираем массив SyncContact[] и шлём
 *      provider.syncContactsBatch(listId, contacts).
 *   4. Рендерим compiledHtml в "общий" вариант: подстановка переменных
 *      нейтральная, БЕЗ click-tracking и БЕЗ open-pixel (per-recipient ID
 *      туда не вставить — bulk режим использует один HTML на всех).
 *      Tracking держим через webhook'и Unisender, метрики не теряются.
 *   5. provider.sendBulkCampaign({listId, html, ...}) → providerCampaignId.
 *   6. EmailCampaign.providerCampaignId = ... , enqueueComplete=true.
 *
 * Дальше:
 *   - processBulkPolling периодически опрашивает getCampaignStats и
 *     обновляет агрегаты в EmailCampaign.stats.
 *   - Webhook'и от Unisender дополняют per-recipient EmailEvent.
 *   - Финиш кампании ставит polling когда status=sent у провайдера.
 */

const STREAM_BATCH = 1000;

export interface BulkRunResult {
  recipients: number;
  providerCampaignId: string | null;
  contactsImported: number;
  contactsUpdated: number;
  errors: number;
}

export async function bulkRunCampaign(campaignId: string): Promise<BulkRunResult> {
  const provider = getMarketingEmailProvider();
  if (!provider.sendBulkCampaign || !provider.syncContactsBatch) {
    throw new Error(
      `Provider "${provider.name}" не поддерживает bulk-режим (sendBulkCampaign/syncContactsBatch).`
    );
  }

  const campaign = await db.emailCampaign.findUnique({
    where: { id: campaignId },
    select: {
      id: true,
      name: true,
      subject: true,
      fromName: true,
      fromEmail: true,
      scheduledAt: true,
      segmentId: true,
      templateId: true,
      enqueueComplete: true,
      providerCampaignId: true,
      template: { select: { compiledHtml: true } },
    },
  });

  if (!campaign) throw new Error(`Campaign ${campaignId} not found`);
  if (!campaign.template) throw new Error(`Campaign ${campaignId} has no template`);
  if (!campaign.segmentId) throw new Error(`Campaign ${campaignId} has no segment`);
  if (campaign.enqueueComplete && campaign.providerCampaignId) {
    return {
      recipients: 0,
      providerCampaignId: campaign.providerCampaignId,
      contactsImported: 0,
      contactsUpdated: 0,
      errors: 0,
    };
  }

  const listId = process.env.UNISENDER_DEFAULT_LIST_ID;
  if (!listId) {
    throw new Error(
      "UNISENDER_DEFAULT_LIST_ID не задан — нужен list_id для importContacts + createCampaign."
    );
  }

  const segment = await db.emailSegment.findUnique({
    where: { id: campaign.segmentId },
    select: { filters: true },
  });
  if (!segment) throw new Error(`Segment ${campaign.segmentId} not found`);

  const segmentWhere = compileSegmentFilters(parseSegmentFilters(segment.filters));
  const where: Prisma.UserWhereInput = {
    AND: [
      segmentWhere,
      { marketingOptOut: false },
      { isBlocked: false },
      { email: { not: "" } },
    ],
  };

  let totalRecipients = 0;
  let contactsImported = 0;
  let contactsUpdated = 0;
  let errors = 0;
  let cursor: string | undefined;

  // 1. Создаём EmailDeliveryJob (status="sent") и параллельно собираем
  // contacts для Unisender import.
  for (;;) {
    const batch = await db.user.findMany({
      where,
      orderBy: { id: "asc" },
      take: STREAM_BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, email: true, fullName: true },
    });
    if (batch.length === 0) break;

    totalRecipients += batch.length;

    // Создаём jobs со status="sent" — отправка делегирована провайдеру,
    // нам нужны только id для tracking-резолва из webhook'ов.
    await db.emailDeliveryJob.createMany({
      data: batch.map((u) => ({
        campaignId: campaign.id,
        userId: u.id,
        email: u.email,
        status: "sent",
        sentAt: new Date(),
        variables: {
          firstName: extractFirstName(u.fullName),
          fullName: u.fullName ?? "",
          email: u.email,
        },
      })),
      skipDuplicates: true,
    });

    const contacts: SyncContact[] = batch.map((u) => ({
      email: u.email,
      fullName: u.fullName ?? null,
    }));

    try {
      const syncResult = await provider.syncContactsBatch!(listId, contacts);
      contactsImported += syncResult.imported;
      contactsUpdated += syncResult.updated;
      errors += syncResult.errors.length;
      if (syncResult.errors.length > 0) {
        console.warn(
          `[bulk-run-campaign ${campaign.id}] ${syncResult.errors.length} sync errors in batch:`,
          syncResult.errors.slice(0, 5)
        );
      }
    } catch (e) {
      console.error(`[bulk-run-campaign ${campaign.id}] syncContactsBatch failed:`, e);
      errors += batch.length;
    }

    cursor = batch[batch.length - 1].id;
    if (batch.length < STREAM_BATCH) break;
  }

  // 2. Рендерим HTML без per-recipient tracking. open/click-метрики
  // придут через webhook'и Unisender. unsubscribeUrl ставим общий
  // через {{unsubscribe_url}} макрос Unisender (он подставит per-user).
  const renderedHtml = applyVariablesAndTracking({
    html: campaign.template.compiledHtml,
    variables: {
      // Здесь должны быть макросы Unisender для персонализации.
      // {{Name}} → имя получателя в Unisender (поле Name из importContacts).
      firstName: "{{Name}}",
      fullName: "{{Name}}",
      email: "{{Email}}",
    },
    // Нет recipientId — без него wrapClickTracking и injectOpenPixel
    // ничего не делают. Это правильное поведение для bulk-режима.
    enableClickTracking: false,
    enableOpenTracking: false,
  });

  // 3. Запускаем у провайдера.
  try {
    const result = await provider.sendBulkCampaign!({
      listId,
      subject: campaign.subject,
      html: renderedHtml,
      fromName: campaign.fromName,
      fromEmail: campaign.fromEmail,
      campaignName: campaign.name,
      scheduledAt: campaign.scheduledAt ?? undefined,
    });

    await db.emailCampaign.update({
      where: { id: campaign.id },
      data: {
        providerCampaignId: result.providerCampaignId,
        enqueueComplete: true,
        stats: {
          recipients: totalRecipients,
          enqueued: totalRecipients,
          providerCampaignId: result.providerCampaignId,
        },
      },
    });

    return {
      recipients: totalRecipients,
      providerCampaignId: result.providerCampaignId,
      contactsImported,
      contactsUpdated,
      errors,
    };
  } catch (e) {
    console.error(`[bulk-run-campaign ${campaign.id}] sendBulkCampaign failed:`, e);
    await db.emailCampaign.update({
      where: { id: campaign.id },
      data: { status: "failed", finishedAt: new Date() },
    });
    throw e;
  }
}
