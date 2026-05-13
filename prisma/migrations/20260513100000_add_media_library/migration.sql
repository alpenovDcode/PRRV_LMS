-- Iter 2: media library + admin chat-id whitelist.
-- All additive.

ALTER TABLE "tg_bots"
  ADD COLUMN IF NOT EXISTS "admin_chat_ids" TEXT[] NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS "tg_media_files" (
  "id"                   TEXT NOT NULL,
  "bot_id"               TEXT NOT NULL,
  "file_id"              TEXT NOT NULL,
  "file_unique_id"       TEXT,
  "kind"                 TEXT NOT NULL,
  "mime_type"            TEXT,
  "file_size"            INTEGER,
  "width"                INTEGER,
  "height"               INTEGER,
  "duration"             INTEGER,
  "title"                TEXT,
  "file_name"            TEXT,
  "thumb_file_id"        TEXT,
  "source"               TEXT NOT NULL DEFAULT 'inbound',
  "captured_by_chat_id"  TEXT,
  "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_used_at"         TIMESTAMP(3),

  CONSTRAINT "tg_media_files_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tg_media_files_bot_id_fkey" FOREIGN KEY ("bot_id")
    REFERENCES "tg_bots"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "tg_media_files_botId_kind_createdAt_idx"
  ON "tg_media_files" ("bot_id", "kind", "created_at");

CREATE INDEX IF NOT EXISTS "tg_media_files_botId_fileUniqueId_idx"
  ON "tg_media_files" ("bot_id", "file_unique_id");
