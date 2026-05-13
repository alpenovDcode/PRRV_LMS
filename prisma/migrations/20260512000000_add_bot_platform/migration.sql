-- Bot platform (Telegram-first SaleBot/BotHelp replacement).
-- All tables are isolated under tg_* prefix; no existing tables are touched.

-- CreateTable
CREATE TABLE "tg_bots" (
    "id" TEXT NOT NULL,
    "token_encrypted" TEXT NOT NULL,
    "token_prefix" TEXT NOT NULL,
    "bot_user_id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "webhook_secret" TEXT NOT NULL,
    "webhook_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "default_start_flow_id" TEXT,
    "subscriber_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tg_bots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tg_subscribers" (
    "id" TEXT NOT NULL,
    "bot_id" TEXT NOT NULL,
    "chat_id" TEXT NOT NULL,
    "tg_user_id" TEXT NOT NULL,
    "first_name" TEXT,
    "last_name" TEXT,
    "username" TEXT,
    "language_code" TEXT,
    "is_blocked" BOOLEAN NOT NULL DEFAULT false,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "variables" JSONB NOT NULL DEFAULT '{}',
    "first_touch_slug" TEXT,
    "first_touch_at" TIMESTAMP(3),
    "last_touch_slug" TEXT,
    "last_touch_at" TIMESTAMP(3),
    "last_seen_at" TIMESTAMP(3),
    "subscribed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unsubscribed_at" TIMESTAMP(3),

    CONSTRAINT "tg_subscribers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tg_messages" (
    "id" TEXT NOT NULL,
    "bot_id" TEXT NOT NULL,
    "subscriber_id" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "tg_message_id" TEXT,
    "text" TEXT,
    "media_type" TEXT,
    "media_file_id" TEXT,
    "callback_data" TEXT,
    "source_type" TEXT,
    "source_id" TEXT,
    "raw_payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tg_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tg_flows" (
    "id" TEXT NOT NULL,
    "bot_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "graph" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "triggers" JSONB NOT NULL DEFAULT '[]',
    "total_entered" INTEGER NOT NULL DEFAULT 0,
    "total_completed" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tg_flows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tg_flow_runs" (
    "id" TEXT NOT NULL,
    "flow_id" TEXT NOT NULL,
    "subscriber_id" TEXT NOT NULL,
    "current_node_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "resume_at" TIMESTAMP(3),
    "waiting_for_var" TEXT,
    "context" JSONB NOT NULL DEFAULT '{}',
    "last_error" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "tg_flow_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tg_broadcasts" (
    "id" TEXT NOT NULL,
    "bot_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "message" JSONB NOT NULL,
    "filter" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "scheduled_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "total_recipients" INTEGER NOT NULL DEFAULT 0,
    "sent_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "blocked_count" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tg_broadcasts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tg_broadcast_recipients" (
    "id" TEXT NOT NULL,
    "broadcast_id" TEXT NOT NULL,
    "subscriber_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "tg_message_id" TEXT,
    "error_code" INTEGER,
    "error_message" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),

    CONSTRAINT "tg_broadcast_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tg_tracking_links" (
    "id" TEXT NOT NULL,
    "bot_id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "start_flow_id" TEXT,
    "apply_tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "utm" JSONB NOT NULL DEFAULT '{}',
    "click_count" INTEGER NOT NULL DEFAULT 0,
    "subscribe_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "tg_tracking_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tg_events" (
    "id" TEXT NOT NULL,
    "bot_id" TEXT,
    "subscriber_id" TEXT,
    "type" TEXT NOT NULL,
    "properties" JSONB NOT NULL DEFAULT '{}',
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tg_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tg_bots_bot_user_id_key" ON "tg_bots"("bot_user_id");

-- CreateIndex
CREATE INDEX "tg_bots_username_idx" ON "tg_bots"("username");

-- CreateIndex
CREATE INDEX "tg_subscribers_bot_id_is_blocked_idx" ON "tg_subscribers"("bot_id", "is_blocked");

-- CreateIndex
CREATE INDEX "tg_subscribers_bot_id_last_seen_at_idx" ON "tg_subscribers"("bot_id", "last_seen_at");

-- CreateIndex
CREATE INDEX "tg_subscribers_tags_idx" ON "tg_subscribers" USING GIN ("tags");

-- CreateIndex
CREATE UNIQUE INDEX "tg_subscribers_bot_id_chat_id_key" ON "tg_subscribers"("bot_id", "chat_id");

-- CreateIndex
CREATE INDEX "tg_messages_bot_id_created_at_idx" ON "tg_messages"("bot_id", "created_at");

-- CreateIndex
CREATE INDEX "tg_messages_subscriber_id_created_at_idx" ON "tg_messages"("subscriber_id", "created_at");

-- CreateIndex
CREATE INDEX "tg_flows_bot_id_is_active_idx" ON "tg_flows"("bot_id", "is_active");

-- CreateIndex
CREATE INDEX "tg_flow_runs_status_resume_at_idx" ON "tg_flow_runs"("status", "resume_at");

-- CreateIndex
CREATE INDEX "tg_flow_runs_subscriber_id_status_idx" ON "tg_flow_runs"("subscriber_id", "status");

-- CreateIndex
CREATE INDEX "tg_flow_runs_flow_id_status_idx" ON "tg_flow_runs"("flow_id", "status");

-- CreateIndex
CREATE INDEX "tg_broadcasts_bot_id_status_idx" ON "tg_broadcasts"("bot_id", "status");

-- CreateIndex
CREATE INDEX "tg_broadcasts_status_scheduled_at_idx" ON "tg_broadcasts"("status", "scheduled_at");

-- CreateIndex
CREATE INDEX "tg_broadcast_recipients_broadcast_id_status_idx" ON "tg_broadcast_recipients"("broadcast_id", "status");

-- CreateIndex
CREATE INDEX "tg_broadcast_recipients_status_next_attempt_at_idx" ON "tg_broadcast_recipients"("status", "next_attempt_at");

-- CreateIndex
CREATE UNIQUE INDEX "tg_broadcast_recipients_broadcast_id_subscriber_id_key" ON "tg_broadcast_recipients"("broadcast_id", "subscriber_id");

-- CreateIndex
CREATE UNIQUE INDEX "tg_tracking_links_bot_id_slug_key" ON "tg_tracking_links"("bot_id", "slug");

-- CreateIndex
CREATE INDEX "tg_events_bot_id_type_occurred_at_idx" ON "tg_events"("bot_id", "type", "occurred_at");

-- CreateIndex
CREATE INDEX "tg_events_subscriber_id_occurred_at_idx" ON "tg_events"("subscriber_id", "occurred_at");

-- AddForeignKey
ALTER TABLE "tg_subscribers" ADD CONSTRAINT "tg_subscribers_bot_id_fkey" FOREIGN KEY ("bot_id") REFERENCES "tg_bots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tg_messages" ADD CONSTRAINT "tg_messages_bot_id_fkey" FOREIGN KEY ("bot_id") REFERENCES "tg_bots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tg_messages" ADD CONSTRAINT "tg_messages_subscriber_id_fkey" FOREIGN KEY ("subscriber_id") REFERENCES "tg_subscribers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tg_flows" ADD CONSTRAINT "tg_flows_bot_id_fkey" FOREIGN KEY ("bot_id") REFERENCES "tg_bots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tg_flow_runs" ADD CONSTRAINT "tg_flow_runs_flow_id_fkey" FOREIGN KEY ("flow_id") REFERENCES "tg_flows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tg_flow_runs" ADD CONSTRAINT "tg_flow_runs_subscriber_id_fkey" FOREIGN KEY ("subscriber_id") REFERENCES "tg_subscribers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tg_broadcasts" ADD CONSTRAINT "tg_broadcasts_bot_id_fkey" FOREIGN KEY ("bot_id") REFERENCES "tg_bots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tg_broadcast_recipients" ADD CONSTRAINT "tg_broadcast_recipients_broadcast_id_fkey" FOREIGN KEY ("broadcast_id") REFERENCES "tg_broadcasts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tg_broadcast_recipients" ADD CONSTRAINT "tg_broadcast_recipients_subscriber_id_fkey" FOREIGN KEY ("subscriber_id") REFERENCES "tg_subscribers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tg_tracking_links" ADD CONSTRAINT "tg_tracking_links_bot_id_fkey" FOREIGN KEY ("bot_id") REFERENCES "tg_bots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tg_events" ADD CONSTRAINT "tg_events_bot_id_fkey" FOREIGN KEY ("bot_id") REFERENCES "tg_bots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tg_events" ADD CONSTRAINT "tg_events_subscriber_id_fkey" FOREIGN KEY ("subscriber_id") REFERENCES "tg_subscribers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
