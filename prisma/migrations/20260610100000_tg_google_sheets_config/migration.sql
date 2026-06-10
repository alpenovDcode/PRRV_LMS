-- Авто-экспорт подписчиков TG-бота в Google Sheets через Apps Script webhook.
CREATE TABLE "tg_google_sheets_configs" (
    "id" TEXT NOT NULL,
    "bot_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "webhook_url" TEXT,
    "secret" TEXT,
    "columns" JSONB NOT NULL DEFAULT '[]',
    "reexport_tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "last_ok_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "tg_google_sheets_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tg_google_sheets_configs_bot_id_key" ON "tg_google_sheets_configs"("bot_id");

ALTER TABLE "tg_google_sheets_configs"
    ADD CONSTRAINT "tg_google_sheets_configs_bot_id_fkey"
    FOREIGN KEY ("bot_id") REFERENCES "tg_bots"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
