-- Полный набор моделей для messaging-инфраструктуры: Inbox, Broadcasts,
-- Lists, Custom Fields, Events, Audit Log. Расширение MessagingSubscriber
-- полями для operator takeover.

-- ─── Enums ─────────────────────────────────────────────────────────────────

CREATE TYPE "MessagingBroadcastStatus" AS ENUM (
    'draft', 'scheduled', 'sending', 'completed', 'cancelled', 'failed'
);

CREATE TYPE "MessagingListType" AS ENUM ('static', 'dynamic');

CREATE TYPE "MessagingCustomFieldType" AS ENUM (
    'text', 'number', 'date', 'email', 'phone', 'url', 'bool', 'select'
);

-- ─── Расширение messaging_subscribers ──────────────────────────────────────

ALTER TABLE "messaging_subscribers"
    ADD COLUMN "operator_takeover_at"  TIMESTAMP(3),
    ADD COLUMN "operator_assignee_id"  TEXT;

CREATE INDEX "messaging_subscribers_operator_assignee_id_idx"
    ON "messaging_subscribers"("operator_assignee_id");

-- ─── messaging_messages (Inbox) ────────────────────────────────────────────

CREATE TABLE "messaging_messages" (
    "id"                  TEXT         NOT NULL,
    "bot_id"              TEXT         NOT NULL,
    "subscriber_id"       TEXT         NOT NULL,
    "direction"           TEXT         NOT NULL,
    "text"                TEXT,
    "callback_payload"    TEXT,
    "attachments"         JSONB,
    "external_message_id" TEXT,
    "source"              TEXT,
    "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "messaging_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "messaging_messages_bot_id_subscriber_id_created_at_idx"
    ON "messaging_messages"("bot_id", "subscriber_id", "created_at");
CREATE INDEX "messaging_messages_subscriber_id_created_at_idx"
    ON "messaging_messages"("subscriber_id", "created_at");
CREATE INDEX "messaging_messages_bot_id_created_at_idx"
    ON "messaging_messages"("bot_id", "created_at");

ALTER TABLE "messaging_messages"
    ADD CONSTRAINT "messaging_messages_bot_id_fkey"
        FOREIGN KEY ("bot_id") REFERENCES "messaging_bots"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "messaging_messages_subscriber_id_fkey"
        FOREIGN KEY ("subscriber_id") REFERENCES "messaging_subscribers"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── messaging_broadcasts ──────────────────────────────────────────────────

CREATE TABLE "messaging_broadcasts" (
    "id"               TEXT                       NOT NULL,
    "bot_id"           TEXT                       NOT NULL,
    "name"             TEXT                       NOT NULL,
    "text"             TEXT                       NOT NULL,
    "buttons"          JSONB,
    "filter"           JSONB                      NOT NULL DEFAULT '{}',
    "status"           "MessagingBroadcastStatus" NOT NULL DEFAULT 'draft',
    "scheduled_at"     TIMESTAMP(3),
    "started_at"       TIMESTAMP(3),
    "completed_at"     TIMESTAMP(3),
    "total_recipients" INTEGER                    NOT NULL DEFAULT 0,
    "sent_count"       INTEGER                    NOT NULL DEFAULT 0,
    "failed_count"     INTEGER                    NOT NULL DEFAULT 0,
    "last_error"       TEXT,
    "created_by_id"    TEXT                       NOT NULL,
    "created_at"       TIMESTAMP(3)               NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"       TIMESTAMP(3)               NOT NULL,
    CONSTRAINT "messaging_broadcasts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "messaging_broadcasts_bot_id_status_idx"
    ON "messaging_broadcasts"("bot_id", "status");
CREATE INDEX "messaging_broadcasts_status_scheduled_at_idx"
    ON "messaging_broadcasts"("status", "scheduled_at");

ALTER TABLE "messaging_broadcasts"
    ADD CONSTRAINT "messaging_broadcasts_bot_id_fkey"
        FOREIGN KEY ("bot_id") REFERENCES "messaging_bots"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── messaging_broadcast_recipients ────────────────────────────────────────

CREATE TABLE "messaging_broadcast_recipients" (
    "id"            TEXT         NOT NULL,
    "broadcast_id"  TEXT         NOT NULL,
    "subscriber_id" TEXT         NOT NULL,
    "status"        TEXT         NOT NULL DEFAULT 'pending',
    "error"         TEXT,
    "sent_at"       TIMESTAMP(3),
    CONSTRAINT "messaging_broadcast_recipients_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "messaging_broadcast_recipients_broadcast_id_subscriber_id_key"
    ON "messaging_broadcast_recipients"("broadcast_id", "subscriber_id");
CREATE INDEX "messaging_broadcast_recipients_broadcast_id_status_idx"
    ON "messaging_broadcast_recipients"("broadcast_id", "status");

ALTER TABLE "messaging_broadcast_recipients"
    ADD CONSTRAINT "messaging_broadcast_recipients_broadcast_id_fkey"
        FOREIGN KEY ("broadcast_id") REFERENCES "messaging_broadcasts"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "messaging_broadcast_recipients_subscriber_id_fkey"
        FOREIGN KEY ("subscriber_id") REFERENCES "messaging_subscribers"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── messaging_lists ───────────────────────────────────────────────────────

CREATE TABLE "messaging_lists" (
    "id"           TEXT                NOT NULL,
    "bot_id"       TEXT                NOT NULL,
    "name"         TEXT                NOT NULL,
    "description"  TEXT,
    "type"         "MessagingListType" NOT NULL DEFAULT 'static',
    "rules"        JSONB,
    "member_count" INTEGER             NOT NULL DEFAULT 0,
    "created_at"   TIMESTAMP(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"   TIMESTAMP(3)        NOT NULL,
    CONSTRAINT "messaging_lists_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "messaging_lists_bot_id_idx" ON "messaging_lists"("bot_id");

ALTER TABLE "messaging_lists"
    ADD CONSTRAINT "messaging_lists_bot_id_fkey"
        FOREIGN KEY ("bot_id") REFERENCES "messaging_bots"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── messaging_list_members ────────────────────────────────────────────────

CREATE TABLE "messaging_list_members" (
    "id"            TEXT         NOT NULL,
    "list_id"       TEXT         NOT NULL,
    "subscriber_id" TEXT         NOT NULL,
    "source"        TEXT         NOT NULL DEFAULT 'manual',
    "added_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "messaging_list_members_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "messaging_list_members_list_id_subscriber_id_key"
    ON "messaging_list_members"("list_id", "subscriber_id");
CREATE INDEX "messaging_list_members_subscriber_id_idx"
    ON "messaging_list_members"("subscriber_id");

ALTER TABLE "messaging_list_members"
    ADD CONSTRAINT "messaging_list_members_list_id_fkey"
        FOREIGN KEY ("list_id") REFERENCES "messaging_lists"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "messaging_list_members_subscriber_id_fkey"
        FOREIGN KEY ("subscriber_id") REFERENCES "messaging_subscribers"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── messaging_custom_fields ───────────────────────────────────────────────

CREATE TABLE "messaging_custom_fields" (
    "id"         TEXT                       NOT NULL,
    "bot_id"     TEXT                       NOT NULL,
    "key"        TEXT                       NOT NULL,
    "label"      TEXT                       NOT NULL,
    "type"       "MessagingCustomFieldType" NOT NULL DEFAULT 'text',
    "options"    TEXT[]                     NOT NULL DEFAULT ARRAY[]::TEXT[],
    "required"   BOOLEAN                    NOT NULL DEFAULT false,
    "sort_order" INTEGER                    NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3)               NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "messaging_custom_fields_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "messaging_custom_fields_bot_id_key_key"
    ON "messaging_custom_fields"("bot_id", "key");
CREATE INDEX "messaging_custom_fields_bot_id_idx"
    ON "messaging_custom_fields"("bot_id");

ALTER TABLE "messaging_custom_fields"
    ADD CONSTRAINT "messaging_custom_fields_bot_id_fkey"
        FOREIGN KEY ("bot_id") REFERENCES "messaging_bots"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── messaging_events ──────────────────────────────────────────────────────

CREATE TABLE "messaging_events" (
    "id"            TEXT         NOT NULL,
    "bot_id"        TEXT         NOT NULL,
    "subscriber_id" TEXT,
    "type"          TEXT         NOT NULL,
    "data"          JSONB,
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "messaging_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "messaging_events_bot_id_type_created_at_idx"
    ON "messaging_events"("bot_id", "type", "created_at");
CREATE INDEX "messaging_events_subscriber_id_created_at_idx"
    ON "messaging_events"("subscriber_id", "created_at");

ALTER TABLE "messaging_events"
    ADD CONSTRAINT "messaging_events_bot_id_fkey"
        FOREIGN KEY ("bot_id") REFERENCES "messaging_bots"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── messaging_bot_audit_logs ──────────────────────────────────────────────

CREATE TABLE "messaging_bot_audit_logs" (
    "id"            TEXT         NOT NULL,
    "bot_id"        TEXT         NOT NULL,
    "actor_user_id" TEXT         NOT NULL,
    "action"        TEXT         NOT NULL,
    "entity"        TEXT,
    "entity_id"     TEXT,
    "details"       JSONB,
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "messaging_bot_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "messaging_bot_audit_logs_bot_id_created_at_idx"
    ON "messaging_bot_audit_logs"("bot_id", "created_at");

ALTER TABLE "messaging_bot_audit_logs"
    ADD CONSTRAINT "messaging_bot_audit_logs_bot_id_fkey"
        FOREIGN KEY ("bot_id") REFERENCES "messaging_bots"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
