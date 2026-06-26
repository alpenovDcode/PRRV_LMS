import { createHmac, timingSafeEqual } from "crypto";
import type {
  BulkCampaignParams,
  BulkCampaignResult,
  CampaignStats,
  EmailEventData,
  EmailProvider,
  SendOneParams,
  SendOneResult,
  SyncContact,
  SyncContactsBatchResult,
  ValidationResult,
} from "./types";
import { unisenderRequest, UnisenderApiError } from "@/lib/email/unisender/api-client";

/**
 * Unisender провайдер. Активируется через EMAIL_MARKETING_PROVIDER=unisender.
 *
 * Архитектура работы:
 *   - Per-email (sendOne) — для автоматизаций (welcome / реактивация). Каждое
 *     письмо персонализированное, идёт по своему графику.
 *   - Bulk (sendBulkCampaign) — для МАССОВЫХ кампаний. Контакты сегмента
 *     синхронизируются через importContacts в list, потом createCampaign
 *     передаёт всю отправку Unisender'у. Нагрузка не на нашу инфру.
 *
 * Tracking:
 *   - track_read=0 / track_links=0 — мы НЕ хотим чтобы Unisender ставил
 *     свой open-pixel и click-redirect. У нас уже есть свои в HTML
 *     (lib/email/compiler/variables.ts). Иначе будут дубли событий.
 *   - Webhook'и от Unisender приходят на /api/email/webhook/unisender и
 *     дополняют наши метрики (delivered/bounced/spam).
 *
 * Конфигурация:
 *   UNISENDER_API_KEY (обязательно)
 *   UNISENDER_API_URL (опц., дефолт https://api.unisender.com/ru/api)
 *   UNISENDER_WEBHOOK_SECRET (обязательно для верификации webhook'ов)
 *   UNISENDER_DEFAULT_LIST_ID (дефолтный list_id для sendBulkCampaign)
 */
export class UnisenderProvider implements EmailProvider {
  readonly name = "unisender" as const;

  /* ───────── per-email ───────── */

  async sendOne(params: SendOneParams): Promise<SendOneResult> {
    const result = await unisenderRequest<{ email_id: string; index?: number }>(
      "sendEmail",
      {
        email: params.to,
        sender_name: params.fromName,
        sender_email: params.fromEmail,
        subject: params.subject,
        body: params.html,
        list_id: process.env.UNISENDER_DEFAULT_LIST_ID,
        // У нас свой tracking — Unisender'у выключаем чтоб не было дублей.
        track_read: 0,
        track_links: 0,
        lang: "ru",
        // Заголовки X-Campaign-Id / X-Recipient-Id пробрасываем через headers.
        // Unisender принимает doopt-headers через `headers` поле.
        headers: params.headers ? formatHeaders(params.headers) : undefined,
      }
    );

    return { providerMessageId: String(result.email_id) };
  }

  /* ───────── контакты ───────── */

  async syncContact(params: {
    email: string;
    name?: string | null;
    tags?: string[];
    customFields?: Record<string, string | number | null>;
  }): Promise<{ externalContactId: string }> {
    const listIds = process.env.UNISENDER_DEFAULT_LIST_ID;
    if (!listIds) {
      throw new Error("UNISENDER_DEFAULT_LIST_ID не задан — некуда подписывать.");
    }
    // double_optin=4 пропускает подтверждение — у нас своя capture-форма,
    // двойного opt-in не нужно.
    const fields: Record<string, string> = { email: params.email };
    if (params.name) fields.Name = params.name;
    if (params.customFields) {
      for (const [k, v] of Object.entries(params.customFields)) {
        if (v !== null && v !== undefined) fields[k] = String(v);
      }
    }
    const result = await unisenderRequest<{ person_id: number | string }>(
      "subscribe",
      {
        list_ids: listIds,
        fields,
        tags: params.tags?.join(","),
        double_optin: 4,
        overwrite: 2,
      }
    );
    return { externalContactId: String(result.person_id) };
  }

  /**
   * Массовый импорт контактов через importContacts. По доке Unisender
   * максимум 10К строк за вызов; для 70K разбиваем на чанки.
   */
  async syncContactsBatch(
    listId: string,
    contacts: SyncContact[]
  ): Promise<SyncContactsBatchResult> {
    const CHUNK = 5000;
    let imported = 0;
    let updated = 0;
    const errors: SyncContactsBatchResult["errors"] = [];

    for (let i = 0; i < contacts.length; i += CHUNK) {
      const slice = contacts.slice(i, i + CHUNK);
      try {
        // field_names: первый — email (Unisender требует), дальше — наши поля.
        const fieldNames = ["email", "Name", "delete"];
        const data = slice.map((c) => [c.email, c.fullName ?? "", ""]);

        const result = await unisenderRequest<{
          total: number;
          inserted: number;
          updated: number;
          new_emails: number;
          invalid: number;
          log: Array<{ index: number; code?: string; message?: string }>;
        }>("importContacts", {
          field_names: fieldNames,
          data,
          double_optin: 3, // skip confirmation
          overwrite_tags: 0,
          overwrite_lists: 0,
        });

        imported += result.inserted ?? 0;
        updated += result.updated ?? 0;
        if (Array.isArray(result.log)) {
          for (const entry of result.log) {
            if (entry.code && entry.code !== "ok") {
              errors.push({
                email: slice[entry.index]?.email ?? "unknown",
                reason: entry.message ?? entry.code,
              });
            }
          }
        }
      } catch (e) {
        // Весь чанк провалился (network/auth) — фиксируем общую ошибку.
        const message = e instanceof Error ? e.message : String(e);
        for (const c of slice) errors.push({ email: c.email, reason: message });
      }
    }

    // listId передаём в createCampaign отдельно — не привязываем контакты к
    // списку через importContacts (overwrite_lists=0). Подписка делается
    // отдельным subscribe вызовом если нужно. Для bulk-режима достаточно что
    // контакты есть в системе Unisender.
    void listId;

    return { imported, updated, errors };
  }

  async unsubscribeContact(email: string): Promise<void> {
    await unisenderRequest("exclude", {
      contact_type: "email",
      contact: email,
      list_ids: process.env.UNISENDER_DEFAULT_LIST_ID,
    });
  }

  /* ───────── массовая кампания ───────── */

  async sendBulkCampaign(params: BulkCampaignParams): Promise<BulkCampaignResult> {
    // 1. Создаём message (заготовку сообщения).
    const message = await unisenderRequest<{ message_id: number | string }>(
      "createEmailMessage",
      {
        sender_name: params.fromName,
        sender_email: params.fromEmail,
        subject: params.subject,
        body: params.html,
        list_id: params.listId,
        lang: "ru",
        // Мы держим tracking у себя — выключаем провайдерский.
        raw_body: 1,
      }
    );

    // 2. Запускаем рассылку.
    const campaign = await unisenderRequest<{
      campaign_id: number | string;
      status: string;
      count: number;
    }>("createCampaign", {
      message_id: message.message_id,
      start_time: params.scheduledAt
        ? formatUnisenderDateTime(params.scheduledAt)
        : undefined,
      track_read: 0,
      track_links: 0,
      track_ga: 0,
      defer: 0,
    });

    return {
      providerCampaignId: String(campaign.campaign_id),
      providerMessageId: String(message.message_id),
    };
  }

  async pauseBulkCampaign(providerCampaignId: string): Promise<void> {
    // Unisender НЕ имеет pause — только cancel. Уведомление в логах.
    console.warn(
      `[unisender] pauseBulkCampaign не поддерживается провайдером, используем cancelCampaign(${providerCampaignId})`
    );
    await this.cancelBulkCampaign(providerCampaignId);
  }

  async resumeBulkCampaign(providerCampaignId: string): Promise<void> {
    throw new Error(
      `Unisender не поддерживает resume отменённой кампании (${providerCampaignId}). Создайте новую через интерфейс.`
    );
  }

  async cancelBulkCampaign(providerCampaignId: string): Promise<void> {
    await unisenderRequest("cancelCampaign", { campaign_id: providerCampaignId });
  }

  /* ───────── validation ───────── */

  async validateEmails(_emails: string[]): Promise<ValidationResult[]> {
    // validateEmail — платная услуга, ~0.18 ₽ за контакт. Делает Евгений
    // вручную перед первой массовой рассылкой через `/contacts → Валидировать`
    // (Спринт 8). Пока возвращаем заглушку.
    return _emails.map((email) => ({ email, status: "unknown" }));
  }

  /* ───────── статистика ───────── */

  async getCampaignStats(providerCampaignId: string): Promise<CampaignStats> {
    type Stats = {
      total?: number;
      sent?: number;
      delivered?: number;
      read?: number;
      clicked?: number;
      unsubscribed?: number;
      spam_complained?: number;
      bounced?: number;
      error_delivery?: number;
      status?: string;
    };

    let aggregate: Stats;
    try {
      aggregate = await unisenderRequest<Stats>("getCampaignAggregateStats", {
        campaign_id: providerCampaignId,
      });
    } catch (e) {
      if (e instanceof UnisenderApiError && e.code === "object_not_found") {
        return { status: "cancelled" };
      }
      throw e;
    }

    return {
      recipients: aggregate.total ?? aggregate.sent,
      delivered: aggregate.delivered,
      opened: aggregate.read,
      clicked: aggregate.clicked,
      unsubscribed: aggregate.unsubscribed,
      bounced: aggregate.bounced,
      spam: aggregate.spam_complained,
      status: mapCampaignStatus(aggregate.status),
    };
  }

  /* ───────── webhook ───────── */

  /**
   * HMAC-проверка подписи webhook'а.
   *
   * Unisender по умолчанию отправляет POST с JSON-массивом событий и
   * параметром `auth` в payload = HMAC. Реально формат зависит от настройки
   * в их кабинете — могут быть варианты:
   *   1. Bearer-token в Authorization header (старый API).
   *   2. md5(body + secret) в поле `auth` payload.
   *   3. HMAC-SHA256 в заголовке X-Signature (рекомендованный новый).
   *
   * Реализуем (3) — самый строгий. Если Unisender использует другой формат,
   * первый webhook покажет какой именно в логах "[unisender webhook] invalid
   * signature" — поправим под их формат.
   */
  verifyWebhookSignature(headers: Headers, rawBody: string): boolean {
    const expected = process.env.UNISENDER_WEBHOOK_SECRET;
    if (!expected) {
      console.warn("[unisender] UNISENDER_WEBHOOK_SECRET не задан — webhook не верифицируется");
      return false;
    }

    // Вариант (3): X-Signature header = HMAC-SHA256(rawBody, secret) в hex.
    const sigHeader =
      headers.get("x-signature") ||
      headers.get("x-unisender-signature") ||
      headers.get("authorization")?.replace(/^Bearer\s+/i, "");

    if (!sigHeader) return false;

    const computed = createHmac("sha256", expected).update(rawBody).digest("hex");

    try {
      const a = Buffer.from(computed, "hex");
      const b = Buffer.from(sigHeader, "hex");
      if (a.length !== b.length) return false;
      return timingSafeEqual(a, b);
    } catch {
      // Fallback: если sigHeader не hex (например base64) — сравним строки.
      // НЕ constant-time, но мы знаем что попали в чужой формат и сразу
      // зальём warn в логи.
      console.warn("[unisender] webhook signature не в hex — фолбэк-сравнение");
      if (computed.length !== sigHeader.length) return false;
      return computed === sigHeader;
    }
  }

  parseWebhookEvent(payload: unknown): EmailEventData[] {
    // Unisender присылает либо массив объектов, либо одиночный объект
    // с полем events:[]. Нормализуем оба варианта.
    let events: unknown[] = [];
    if (Array.isArray(payload)) {
      events = payload;
    } else if (payload && typeof payload === "object") {
      const obj = payload as Record<string, unknown>;
      if (Array.isArray(obj.events)) events = obj.events as unknown[];
      else events = [payload];
    }

    const result: EmailEventData[] = [];
    for (const raw of events) {
      if (!raw || typeof raw !== "object") continue;
      const e = raw as Record<string, unknown>;
      const eventName = String(e.event_name ?? e.type ?? "");
      const email = String(e.email ?? e.contact ?? "");
      if (!email) continue;

      const mapped = mapUnisenderEvent(eventName);
      if (!mapped) continue;

      const occurredRaw = e.occurred_at ?? e.timestamp;
      const occurredAt =
        typeof occurredRaw === "string" || typeof occurredRaw === "number"
          ? new Date(occurredRaw)
          : new Date();

      const providerEventId =
        typeof e.event_id === "string"
          ? e.event_id
          : typeof e.email_id === "string" || typeof e.email_id === "number"
            ? `${eventName}:${e.email_id}`
            : undefined;

      const metadata: Record<string, unknown> = {};
      if (mapped.bounceType) metadata.bounceType = mapped.bounceType;
      if (e.message_id) metadata.providerMessageId = String(e.message_id);
      if (e.campaign_id) metadata.providerCampaignId = String(e.campaign_id);
      if (e.reason) metadata.reason = String(e.reason);

      result.push({
        email,
        type: mapped.type,
        url: typeof e.url === "string" ? e.url : undefined,
        providerEventId,
        occurredAt,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      });
    }

    return result;
  }
}

/* ───────── helpers ───────── */

function formatHeaders(headers: Record<string, string>): Record<string, string> {
  // Unisender принимает headers как plain object — ничего не делаем, кроме
  // отсева неподдерживаемых.
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

function formatUnisenderDateTime(date: Date): string {
  // Unisender ожидает "YYYY-MM-DD HH:mm:ss" в UTC.
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`
  );
}

function mapCampaignStatus(raw?: string): CampaignStats["status"] {
  switch (raw) {
    case "scheduled":
    case "waits_censor":
    case "censor_hold":
    case "censor_decline":
      return "queued";
    case "in_progress":
      return "sending";
    case "completed":
      return "sent";
    case "canceled":
    case "cancelled":
      return "cancelled";
    case "error":
      return "failed";
    default:
      return undefined;
  }
}

interface MappedEvent {
  type: EmailEventData["type"];
  bounceType?: "soft" | "hard";
}

function mapUnisenderEvent(name: string): MappedEvent | null {
  switch (name) {
    case "sent":
      // Мы свой sent пишем при send-attempt, провайдерский — это accepted-by-provider.
      // Маппим в delivered чтобы не дублировать sent.
      return { type: "delivered" };
    case "delivered":
      return { type: "delivered" };
    case "read":
    case "opened":
      return { type: "opened" };
    case "clicked":
      return { type: "clicked" };
    case "hard_bounced":
    case "bounced":
      return { type: "bounced", bounceType: "hard" };
    case "soft_bounced":
      return { type: "bounced", bounceType: "soft" };
    case "spam":
    case "spam_complained":
      return { type: "spam" };
    case "unsubscribed":
      return { type: "unsubscribed" };
    default:
      return null;
  }
}
