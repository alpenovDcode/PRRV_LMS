/**
 * Единый интерфейс провайдеров доставки маркетинговых писем.
 *
 * Реализации:
 *  - YandexSmtpProvider — текущий Yandex 360 SMTP. Стартовая реализация для тестов
 *    и узких сегментов до прогрева Unisender-домена.
 *  - UnisenderProvider  — продакшен после возвращения Евгения, прогрева домена
 *    и заключения договора. Подмена через env `EMAIL_MARKETING_PROVIDER=unisender`.
 *
 * Транзакционные письма (welcome, ДЗ, оплата, сертификат) НЕ используют этот
 * слой. Они продолжают идти через lib/email-service.ts и kpc@prrv.tech.
 */

export type EmailProviderName = "yandex" | "unisender";

export interface SendOneParams {
  to: string;
  subject: string;
  html: string;
  fromName: string;
  fromEmail: string;
  /**
   * Дополнительные заголовки для письма. Используются для List-Unsubscribe
   * (one-click), Reply-To, X-Campaign-Id, X-Recipient-Id и т.п.
   */
  headers?: Record<string, string>;
  /**
   * ID получателя в EmailDeliveryJob/BroadcastRecipient. Прокидывается провайдеру
   * для связи в webhook-событиях и попадает в X-Recipient-Id заголовок.
   */
  recipientId?: string;
}

export interface SendOneResult {
  /** ID сообщения у провайдера (если выдаётся). Может пригодиться для дедупа webhook'ов. */
  providerMessageId?: string;
}

export interface ValidationResult {
  email: string;
  /** valid | invalid | unknown | spam_trap | role_address | disposable */
  status: string;
  reason?: string;
}

export interface CampaignStats {
  recipients?: number;
  delivered?: number;
  opened?: number;
  clicked?: number;
  unsubscribed?: number;
  bounced?: number;
  spam?: number;
  /** Статус на стороне провайдера: queued | sending | sent | paused | cancelled | failed. */
  status?: "queued" | "sending" | "sent" | "paused" | "cancelled" | "failed";
}

/**
 * Контакт для массовой синхронизации с listId. Используется в варианте B
 * (createCampaign): мы один раз синхронизируем сегмент в Unisender list и
 * передаём listId в createCampaign — провайдер шлёт сам.
 */
export interface SyncContact {
  email: string;
  fullName?: string | null;
  tags?: string[];
  customFields?: Record<string, string | number | null>;
}

export interface SyncContactsBatchResult {
  imported: number;
  updated: number;
  errors: Array<{ email: string; reason: string }>;
}

/**
 * Параметры для массовой кампании через provider-side рассылку (createCampaign).
 * HTML уже скомпилирован с tracking-пикселями и click-tracking (мы держим
 * tracking у себя независимо от провайдера — open/click летят на наш домен).
 */
export interface BulkCampaignParams {
  /** ID списка контактов в провайдере, куда были синхронизированы получатели. */
  listId: string;
  subject: string;
  html: string;
  fromName: string;
  fromEmail: string;
  /** Внутренний ID нашей кампании — для idempotency-name у провайдера. */
  campaignName: string;
  /** Когда стартовать у провайдера. Без поля — немедленно. */
  scheduledAt?: Date;
  /** Если задано — провайдер отфильтрует получателей по этим segmentId. */
  providerSegmentIds?: string[];
}

export interface BulkCampaignResult {
  providerCampaignId: string;
  providerMessageId?: string;
}

/**
 * Распарсенное webhook-событие от провайдера. Записывается в EmailEvent.
 */
export interface EmailEventData {
  email: string;
  type: "delivered" | "opened" | "clicked" | "bounced" | "spam" | "unsubscribed";
  url?: string;
  providerEventId?: string;
  occurredAt?: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Минимальный контракт. Несовместимые провайдеры (Yandex SMTP не умеет
 * присылать webhook'и или валидировать почту) реализуют только sendOne.
 * Опциональные методы помечены `?` — вызывающий код проверяет наличие.
 *
 * Архитектурное разделение per-email vs bulk:
 *   - sendOne: всегда нужен. Используется для автоматизаций (welcome,
 *     реактивация) — там каждое письмо персонализированное и идёт по
 *     своему графику.
 *   - sendBulkCampaign: для МАССОВЫХ кампаний на 10K+ получателей.
 *     Делегирует отправку провайдеру (createCampaign в Unisender) —
 *     нагрузка на их инфру, не на нашу. Yandex SMTP не имеет аналога.
 *
 * Vendor-агностичный layer выбирает путь автоматически: если
 * provider.sendBulkCampaign существует → bulk mode, иначе per-email через
 * EmailDeliveryJob queue (как делает Yandex).
 */
export interface EmailProvider {
  readonly name: EmailProviderName;

  /** Отправка ОДНОГО письма. Обязательный метод. */
  sendOne(params: SendOneParams): Promise<SendOneResult>;

  /** Создать/обновить контакт во внешнем сервисе. Возвращает externalContactId. */
  syncContact?(params: {
    email: string;
    name?: string | null;
    tags?: string[];
    customFields?: Record<string, string | number | null>;
  }): Promise<{ externalContactId: string }>;

  /**
   * Массовая синхронизация контактов в provider list. Используется перед
   * sendBulkCampaign — гарантирует что все получатели сегмента есть у
   * провайдера. Идемпотентна: повторный вызов с теми же email обновляет.
   */
  syncContactsBatch?(
    listId: string,
    contacts: SyncContact[]
  ): Promise<SyncContactsBatchResult>;

  /**
   * Запускает массовую кампанию на стороне провайдера. Контакты должны
   * быть предварительно синхронизированы через syncContactsBatch.
   * Провайдер шлёт сам и присылает события через webhook.
   */
  sendBulkCampaign?(params: BulkCampaignParams): Promise<BulkCampaignResult>;

  /** Пауза bulk-кампании у провайдера. */
  pauseBulkCampaign?(providerCampaignId: string): Promise<void>;

  /** Возобновление паузной bulk-кампании у провайдера. */
  resumeBulkCampaign?(providerCampaignId: string): Promise<void>;

  /** Отмена bulk-кампании у провайдера (необратимо). */
  cancelBulkCampaign?(providerCampaignId: string): Promise<void>;

  /** Отписать контакт во внешнем сервисе (вызывается из /api/email/unsubscribe). */
  unsubscribeContact?(email: string): Promise<void>;

  /** Валидация email-адресов через сервис провайдера. */
  validateEmails?(emails: string[]): Promise<ValidationResult[]>;

  /** Aggregate-статистика кампании из API провайдера (для dashboard). */
  getCampaignStats?(providerCampaignId: string): Promise<CampaignStats>;

  /** HMAC-проверка подписи webhook'а. Возвращает true если payload подлинный. */
  verifyWebhookSignature?(headers: Headers, rawBody: string): boolean;

  /** Парсинг payload webhook'а в нормализованные EmailEvent'ы. */
  parseWebhookEvent?(payload: unknown): EmailEventData[];
}
