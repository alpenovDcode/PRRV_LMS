-- Telegram-каналы/супергруппы, подключённые к боту (бот обязан быть админом).
-- Используются для KPI «вступили в канал» и атрибуции по invite-link-у.

CREATE TABLE "tg_channels" (
    "id" TEXT NOT NULL,
    "bot_id" TEXT NOT NULL,
    "chat_id" TEXT NOT NULL,
    "username" TEXT,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'channel',
    "baseline_count" INTEGER NOT NULL DEFAULT 0,
    "baseline_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "tg_channels_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tg_channels_bot_id_chat_id_key" ON "tg_channels"("bot_id", "chat_id");
CREATE INDEX "tg_channels_bot_id_is_active_idx" ON "tg_channels"("bot_id", "is_active");

ALTER TABLE "tg_channels"
    ADD CONSTRAINT "tg_channels_bot_id_fkey"
    FOREIGN KEY ("bot_id") REFERENCES "tg_bots"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Именная invite-link на канал — UTM-аналог для атрибуции join'ов.
CREATE TABLE "tg_channel_invite_links" (
    "id" TEXT NOT NULL,
    "bot_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "invite_url" TEXT NOT NULL,
    "utm" JSONB NOT NULL DEFAULT '{}',
    "join_count" INTEGER NOT NULL DEFAULT 0,
    "member_limit" INTEGER,
    "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tg_channel_invite_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tg_channel_invite_links_channel_id_name_key"
    ON "tg_channel_invite_links"("channel_id", "name");
CREATE INDEX "tg_channel_invite_links_bot_id_created_at_idx"
    ON "tg_channel_invite_links"("bot_id", "created_at");

ALTER TABLE "tg_channel_invite_links"
    ADD CONSTRAINT "tg_channel_invite_links_bot_id_fkey"
    FOREIGN KEY ("bot_id") REFERENCES "tg_bots"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tg_channel_invite_links"
    ADD CONSTRAINT "tg_channel_invite_links_channel_id_fkey"
    FOREIGN KEY ("channel_id") REFERENCES "tg_channels"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Состояние участника канала + история join/leave.
CREATE TABLE "tg_channel_memberships" (
    "id" TEXT NOT NULL,
    "bot_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "tg_user_id" TEXT NOT NULL,
    "subscriber_id" TEXT,
    "status" TEXT NOT NULL,
    "invite_link_name" TEXT,
    "invite_link_url" TEXT,
    "joined_at" TIMESTAMP(3),
    "left_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "tg_channel_memberships_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tg_channel_memberships_channel_id_tg_user_id_key"
    ON "tg_channel_memberships"("channel_id", "tg_user_id");
CREATE INDEX "tg_channel_memberships_bot_id_channel_id_status_idx"
    ON "tg_channel_memberships"("bot_id", "channel_id", "status");
CREATE INDEX "tg_channel_memberships_bot_id_subscriber_id_idx"
    ON "tg_channel_memberships"("bot_id", "subscriber_id");
CREATE INDEX "tg_channel_memberships_bot_id_joined_at_idx"
    ON "tg_channel_memberships"("bot_id", "joined_at");

ALTER TABLE "tg_channel_memberships"
    ADD CONSTRAINT "tg_channel_memberships_bot_id_fkey"
    FOREIGN KEY ("bot_id") REFERENCES "tg_bots"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tg_channel_memberships"
    ADD CONSTRAINT "tg_channel_memberships_channel_id_fkey"
    FOREIGN KEY ("channel_id") REFERENCES "tg_channels"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tg_channel_memberships"
    ADD CONSTRAINT "tg_channel_memberships_subscriber_id_fkey"
    FOREIGN KEY ("subscriber_id") REFERENCES "tg_subscribers"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
