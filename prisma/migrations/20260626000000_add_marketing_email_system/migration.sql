-- Marketing Email System (Спринт 0).
--
-- Архитектура: docs/MARKETING_EMAIL_SYSTEM.md
--
-- Расширения существующих таблиц:
--   users — поля для интеграции с провайдером (Unisender) и отписок.
--   broadcast_recipients — поля для tracking (open/click/bounce/spam).
--
-- Новые таблицы:
--   email_campaigns         — маркетинговая кампания.
--   email_visual_templates  — блочный шаблон (TipTap JSON + готовый HTML).
--   email_segments          — динамические сегменты пользователей.
--   email_delivery_jobs     — очередь отправки (обрабатывает /api/email-cron/tick).
--   email_automations       — триггерные цепочки.
--   email_automation_runs   — запуски цепочек для конкретных пользователей.
--   email_events            — лог открытий/кликов/баунсов/отписок.
--   email_contact_imports   — история CSV-импортов.
--
-- Транзакционные модели (email_templates, broadcasts) не трогаются.

-- AlterTable
ALTER TABLE "broadcast_recipients" ADD COLUMN     "bounce_reason" TEXT,
ADD COLUMN     "bounce_type" TEXT,
ADD COLUMN     "bounced_at" TIMESTAMP(3),
ADD COLUMN     "click_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "clicked_at" TIMESTAMP(3),
ADD COLUMN     "delivered_at" TIMESTAMP(3),
ADD COLUMN     "open_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "opened_at" TIMESTAMP(3),
ADD COLUMN     "provider_message_id" TEXT,
ADD COLUMN     "spam_reported_at" TIMESTAMP(3),
ADD COLUMN     "unsubscribed_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "contact_synced_at" TIMESTAMP(3),
ADD COLUMN     "email_tags" JSONB,
ADD COLUMN     "email_validated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "external_contact_id" TEXT,
ADD COLUMN     "marketing_opt_out" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "unsubscribe_token" TEXT,
ADD COLUMN     "unsubscribed_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "email_campaigns" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "preheader" TEXT,
    "from_name" TEXT NOT NULL,
    "from_email" TEXT NOT NULL,
    "template_id" TEXT,
    "segment_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "scheduled_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "ab_test" JSONB,
    "stats" JSONB NOT NULL DEFAULT '{}',
    "provider_campaign_id" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_visual_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'marketing',
    "subject" TEXT NOT NULL,
    "preheader" TEXT,
    "blocks" JSONB NOT NULL,
    "compiled_html" TEXT NOT NULL,
    "thumbnail_url" TEXT,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_visual_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_segments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "filters" JSONB NOT NULL,
    "contact_count" INTEGER NOT NULL DEFAULT 0,
    "provider_list_id" TEXT,
    "synced_at" TIMESTAMP(3),
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_delivery_jobs" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "user_id" TEXT,
    "email" TEXT NOT NULL,
    "variables" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_error" TEXT,
    "sent_at" TIMESTAMP(3),
    "provider_message_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_delivery_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_automations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "trigger_data" JSONB,
    "steps" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "stats" JSONB NOT NULL DEFAULT '{}',
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_automations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_automation_runs" (
    "id" TEXT NOT NULL,
    "automation_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "current_step" INTEGER NOT NULL DEFAULT 0,
    "next_step_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'running',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "email_automation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_events" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "email" TEXT NOT NULL,
    "campaign_id" TEXT,
    "recipient_id" TEXT,
    "type" TEXT NOT NULL,
    "url" TEXT,
    "user_agent" TEXT,
    "ip_hash" TEXT,
    "provider_event_id" TEXT,
    "metadata" JSONB,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_contact_imports" (
    "id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "rows_total" INTEGER NOT NULL,
    "rows_imported" INTEGER NOT NULL,
    "rows_skipped" INTEGER NOT NULL,
    "errors" JSONB NOT NULL DEFAULT '[]',
    "segment_id" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_contact_imports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_campaigns_status_scheduled_at_idx" ON "email_campaigns"("status", "scheduled_at");

-- CreateIndex
CREATE INDEX "email_delivery_jobs_status_next_attempt_at_idx" ON "email_delivery_jobs"("status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "email_delivery_jobs_campaign_id_status_idx" ON "email_delivery_jobs"("campaign_id", "status");

-- CreateIndex
CREATE INDEX "email_automation_runs_user_id_automation_id_idx" ON "email_automation_runs"("user_id", "automation_id");

-- CreateIndex
CREATE INDEX "email_automation_runs_status_next_step_at_idx" ON "email_automation_runs"("status", "next_step_at");

-- CreateIndex
CREATE UNIQUE INDEX "email_events_provider_event_id_key" ON "email_events"("provider_event_id");

-- CreateIndex
CREATE INDEX "email_events_user_id_type_idx" ON "email_events"("user_id", "type");

-- CreateIndex
CREATE INDEX "email_events_campaign_id_type_occurred_at_idx" ON "email_events"("campaign_id", "type", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "users_external_contact_id_key" ON "users"("external_contact_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_unsubscribe_token_key" ON "users"("unsubscribe_token");

-- AddForeignKey
ALTER TABLE "email_campaigns" ADD CONSTRAINT "email_campaigns_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "email_visual_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_campaigns" ADD CONSTRAINT "email_campaigns_segment_id_fkey" FOREIGN KEY ("segment_id") REFERENCES "email_segments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_delivery_jobs" ADD CONSTRAINT "email_delivery_jobs_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "email_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_delivery_jobs" ADD CONSTRAINT "email_delivery_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_automation_runs" ADD CONSTRAINT "email_automation_runs_automation_id_fkey" FOREIGN KEY ("automation_id") REFERENCES "email_automations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_automation_runs" ADD CONSTRAINT "email_automation_runs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "email_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_contact_imports" ADD CONSTRAINT "email_contact_imports_segment_id_fkey" FOREIGN KEY ("segment_id") REFERENCES "email_segments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
