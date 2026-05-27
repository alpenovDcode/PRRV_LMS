-- Этап 8: MessagingBitrixConfig + MessagingTrackingLink + MessagingTrackingClick

-- Bitrix24 config per messaging bot
CREATE TABLE IF NOT EXISTS "messaging_bitrix_configs" (
    "id" TEXT NOT NULL,
    "bot_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "webhook_url" TEXT,
    "funnel_id" TEXT NOT NULL DEFAULT '0',
    "default_stage_id" TEXT NOT NULL DEFAULT '',
    "contact_mappings" JSONB NOT NULL DEFAULT '[]',
    "deal_mappings" JSONB NOT NULL DEFAULT '[]',
    "tag_triggers" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "messaging_bitrix_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "messaging_bitrix_configs_bot_id_key" ON "messaging_bitrix_configs"("bot_id");

ALTER TABLE "messaging_bitrix_configs"
  ADD CONSTRAINT "messaging_bitrix_configs_bot_id_fkey"
  FOREIGN KEY ("bot_id") REFERENCES "messaging_bots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Tracking links
CREATE TABLE IF NOT EXISTS "messaging_tracking_links" (
    "id" TEXT NOT NULL,
    "bot_id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "target_url" TEXT NOT NULL,
    "attach_tag" TEXT,
    "meta" JSONB,
    "click_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messaging_tracking_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "messaging_tracking_links_slug_key" ON "messaging_tracking_links"("slug");
CREATE INDEX IF NOT EXISTS "messaging_tracking_links_bot_id_idx" ON "messaging_tracking_links"("bot_id");

ALTER TABLE "messaging_tracking_links"
  ADD CONSTRAINT "messaging_tracking_links_bot_id_fkey"
  FOREIGN KEY ("bot_id") REFERENCES "messaging_bots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Tracking clicks
CREATE TABLE IF NOT EXISTS "messaging_tracking_clicks" (
    "id" TEXT NOT NULL,
    "link_id" TEXT NOT NULL,
    "subscriber_id" TEXT,
    "ip" TEXT,
    "user_agent" TEXT,
    "referer" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messaging_tracking_clicks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "messaging_tracking_clicks_link_id_created_at_idx" ON "messaging_tracking_clicks"("link_id", "created_at");
CREATE INDEX IF NOT EXISTS "messaging_tracking_clicks_subscriber_id_created_at_idx" ON "messaging_tracking_clicks"("subscriber_id", "created_at");

ALTER TABLE "messaging_tracking_clicks"
  ADD CONSTRAINT "messaging_tracking_clicks_link_id_fkey"
  FOREIGN KEY ("link_id") REFERENCES "messaging_tracking_links"("id") ON DELETE CASCADE ON UPDATE CASCADE;
