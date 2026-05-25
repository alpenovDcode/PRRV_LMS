-- TgBitrixConfig: per-bot Bitrix24 integration settings.
-- One-to-one with tg_bots (optional). Stores webhook URL override,
-- contact/deal field mappings (JSON arrays), and tag triggers.

CREATE TABLE "tg_bitrix_configs" (
  "id"               TEXT        NOT NULL,
  "bot_id"           TEXT        NOT NULL,
  "enabled"          BOOLEAN     NOT NULL DEFAULT FALSE,
  "webhook_url"      TEXT,
  "funnel_id"        TEXT        NOT NULL DEFAULT '0',
  "default_stage_id" TEXT        NOT NULL DEFAULT '',
  "contact_mappings" JSONB       NOT NULL DEFAULT '[]',
  "deal_mappings"    JSONB       NOT NULL DEFAULT '[]',
  "tag_triggers"     JSONB       NOT NULL DEFAULT '[]',
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMP(3) NOT NULL,

  CONSTRAINT "tg_bitrix_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tg_bitrix_configs_bot_id_key" ON "tg_bitrix_configs"("bot_id");

ALTER TABLE "tg_bitrix_configs"
  ADD CONSTRAINT "tg_bitrix_configs_bot_id_fkey"
  FOREIGN KEY ("bot_id") REFERENCES "tg_bots"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
