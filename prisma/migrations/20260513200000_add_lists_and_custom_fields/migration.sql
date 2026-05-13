-- Iter 2b+2c: Lists + TypedCustomFields.
-- All additive. No destructive ops.

CREATE TABLE IF NOT EXISTS "tg_lists" (
  "id"               TEXT NOT NULL,
  "bot_id"           TEXT NOT NULL,
  "name"             TEXT NOT NULL,
  "icon"             TEXT,
  "description"      TEXT,
  "auto_tag_rules"   JSONB NOT NULL DEFAULT '{}',
  "member_count"     INTEGER NOT NULL DEFAULT 0,
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "tg_lists_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tg_lists_bot_id_fkey" FOREIGN KEY ("bot_id")
    REFERENCES "tg_bots"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "tg_lists_bot_name_unique" UNIQUE ("bot_id", "name")
);
CREATE INDEX IF NOT EXISTS "tg_lists_botId_idx" ON "tg_lists" ("bot_id");

CREATE TABLE IF NOT EXISTS "tg_subscriber_lists" (
  "id"              TEXT NOT NULL,
  "list_id"         TEXT NOT NULL,
  "subscriber_id"   TEXT NOT NULL,
  "joined_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "tg_subscriber_lists_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tg_subscriber_lists_list_id_fkey" FOREIGN KEY ("list_id")
    REFERENCES "tg_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "tg_subscriber_lists_subscriber_id_fkey" FOREIGN KEY ("subscriber_id")
    REFERENCES "tg_subscribers"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "tg_subscriber_lists_unique" UNIQUE ("list_id", "subscriber_id")
);
CREATE INDEX IF NOT EXISTS "tg_subscriber_lists_subscriberId_idx" ON "tg_subscriber_lists" ("subscriber_id");
CREATE INDEX IF NOT EXISTS "tg_subscriber_lists_listId_joinedAt_idx" ON "tg_subscriber_lists" ("list_id", "joined_at");

CREATE TABLE IF NOT EXISTS "tg_custom_fields" (
  "id"               TEXT NOT NULL,
  "bot_id"           TEXT NOT NULL,
  "key"              TEXT NOT NULL,
  "label"            TEXT NOT NULL,
  "type"             TEXT NOT NULL,
  "description"      TEXT,
  "options"          JSONB NOT NULL DEFAULT '[]',
  "validation_regex" TEXT,
  "is_required"      BOOLEAN NOT NULL DEFAULT FALSE,
  "sort_order"       INTEGER NOT NULL DEFAULT 0,
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "tg_custom_fields_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tg_custom_fields_bot_id_fkey" FOREIGN KEY ("bot_id")
    REFERENCES "tg_bots"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "tg_custom_fields_bot_key_unique" UNIQUE ("bot_id", "key")
);
CREATE INDEX IF NOT EXISTS "tg_custom_fields_botId_sortOrder_idx" ON "tg_custom_fields" ("bot_id", "sort_order");
