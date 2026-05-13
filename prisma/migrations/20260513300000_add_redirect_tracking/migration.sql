-- Iter 3: redirect-tracking links for outbound URL click attribution.

CREATE TABLE IF NOT EXISTS "tg_redirect_links" (
  "id"              TEXT NOT NULL,
  "bot_id"          TEXT NOT NULL,
  "slug"            TEXT NOT NULL,
  "target_url"      TEXT NOT NULL,
  "source_flow_id"  TEXT,
  "source_node_id"  TEXT,
  "subscriber_id"   TEXT,
  "click_count"     INTEGER NOT NULL DEFAULT 0,
  "last_click_at"   TIMESTAMP(3),
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at"      TIMESTAMP(3),

  CONSTRAINT "tg_redirect_links_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tg_redirect_links_bot_id_fkey" FOREIGN KEY ("bot_id")
    REFERENCES "tg_bots"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "tg_redirect_links_slug_unique" UNIQUE ("slug")
);
CREATE INDEX IF NOT EXISTS "tg_redirect_links_botId_createdAt_idx"
  ON "tg_redirect_links" ("bot_id", "created_at");
CREATE INDEX IF NOT EXISTS "tg_redirect_links_subscriberId_idx"
  ON "tg_redirect_links" ("subscriber_id");
