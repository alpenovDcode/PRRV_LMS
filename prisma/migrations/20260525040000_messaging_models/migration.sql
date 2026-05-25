-- CreateEnum
CREATE TYPE "MessagingChannel" AS ENUM ('telegram', 'instagram', 'max');

-- CreateTable: messaging_bots
CREATE TABLE "messaging_bots" (
    "id"                   TEXT             NOT NULL,
    "channel"              "MessagingChannel" NOT NULL,
    "external_account_id"  TEXT             NOT NULL,
    "title"                TEXT             NOT NULL,
    "token_enc"            TEXT             NOT NULL,
    "token_expires_at"     TIMESTAMP(3),
    "meta"                 JSONB,
    "is_active"            BOOLEAN          NOT NULL DEFAULT true,
    "owner_id"             TEXT             NOT NULL,
    "created_at"           TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"           TIMESTAMP(3)     NOT NULL,
    CONSTRAINT "messaging_bots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "messaging_bots_channel_external_account_id_key"
    ON "messaging_bots"("channel", "external_account_id");
CREATE INDEX "messaging_bots_owner_id_idx" ON "messaging_bots"("owner_id");

ALTER TABLE "messaging_bots"
    ADD CONSTRAINT "messaging_bots_owner_id_fkey"
        FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: messaging_subscribers
CREATE TABLE "messaging_subscribers" (
    "id"               TEXT         NOT NULL,
    "bot_id"           TEXT         NOT NULL,
    "external_user_id" TEXT         NOT NULL,
    "first_name"       TEXT,
    "last_name"        TEXT,
    "username"         TEXT,
    "variables"        JSONB        NOT NULL DEFAULT '{}',
    "tags"             TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
    "last_inbound_at"  TIMESTAMP(3),
    "subscribed_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at"     TIMESTAMP(3),
    "lms_user_id"      TEXT,
    CONSTRAINT "messaging_subscribers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "messaging_subscribers_bot_id_external_user_id_key"
    ON "messaging_subscribers"("bot_id", "external_user_id");
CREATE INDEX "messaging_subscribers_bot_id_idx" ON "messaging_subscribers"("bot_id");
CREATE INDEX "messaging_subscribers_lms_user_id_idx" ON "messaging_subscribers"("lms_user_id");

ALTER TABLE "messaging_subscribers"
    ADD CONSTRAINT "messaging_subscribers_bot_id_fkey"
        FOREIGN KEY ("bot_id") REFERENCES "messaging_bots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "messaging_subscribers"
    ADD CONSTRAINT "messaging_subscribers_lms_user_id_fkey"
        FOREIGN KEY ("lms_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: messaging_oauth_states
CREATE TABLE "messaging_oauth_states" (
    "id"         TEXT             NOT NULL,
    "state"      TEXT             NOT NULL,
    "channel"    "MessagingChannel" NOT NULL,
    "user_id"    TEXT             NOT NULL,
    "created_at" TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3)     NOT NULL,
    CONSTRAINT "messaging_oauth_states_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "messaging_oauth_states_state_key" ON "messaging_oauth_states"("state");
CREATE INDEX "messaging_oauth_states_expires_at_idx" ON "messaging_oauth_states"("expires_at");
