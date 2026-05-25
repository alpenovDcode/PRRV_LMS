-- CreateEnum
CREATE TYPE "MessagingTriggerType" AS ENUM (
    'keyword_dm', 'keyword_comment', 'story_reply', 'mention',
    'subscriber_joined', 'manual'
);

CREATE TYPE "MessagingFlowRunStatus" AS ENUM (
    'running', 'waiting_reply', 'completed', 'cancelled', 'failed'
);

-- CreateTable: messaging_flows
CREATE TABLE "messaging_flows" (
    "id"          TEXT         NOT NULL,
    "bot_id"      TEXT         NOT NULL,
    "name"        TEXT         NOT NULL,
    "description" TEXT,
    "is_active"   BOOLEAN      NOT NULL DEFAULT true,
    "graph"       JSONB        NOT NULL,
    "run_count"   INTEGER      NOT NULL DEFAULT 0,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMP(3) NOT NULL,
    CONSTRAINT "messaging_flows_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "messaging_flows_bot_id_idx" ON "messaging_flows"("bot_id");

ALTER TABLE "messaging_flows"
    ADD CONSTRAINT "messaging_flows_bot_id_fkey"
        FOREIGN KEY ("bot_id") REFERENCES "messaging_bots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: messaging_triggers
CREATE TABLE "messaging_triggers" (
    "id"                 TEXT                   NOT NULL,
    "flow_id"            TEXT                   NOT NULL,
    "type"               "MessagingTriggerType" NOT NULL,
    "keywords"           TEXT[]                 NOT NULL DEFAULT ARRAY[]::TEXT[],
    "match_type"         TEXT                   NOT NULL DEFAULT 'contains',
    "case_sensitive"     BOOLEAN                NOT NULL DEFAULT false,
    "media_ids"          TEXT[]                 NOT NULL DEFAULT ARRAY[]::TEXT[],
    "trigger_count"      INTEGER                NOT NULL DEFAULT 0,
    "last_triggered_at"  TIMESTAMP(3),
    "created_at"         TIMESTAMP(3)           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"         TIMESTAMP(3)           NOT NULL,
    CONSTRAINT "messaging_triggers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "messaging_triggers_flow_id_idx" ON "messaging_triggers"("flow_id");
CREATE INDEX "messaging_triggers_type_idx"   ON "messaging_triggers"("type");

ALTER TABLE "messaging_triggers"
    ADD CONSTRAINT "messaging_triggers_flow_id_fkey"
        FOREIGN KEY ("flow_id") REFERENCES "messaging_flows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: messaging_flow_runs
CREATE TABLE "messaging_flow_runs" (
    "id"              TEXT                     NOT NULL,
    "flow_id"         TEXT                     NOT NULL,
    "subscriber_id"   TEXT                     NOT NULL,
    "status"          "MessagingFlowRunStatus" NOT NULL DEFAULT 'running',
    "current_node_id" TEXT,
    "context"         JSONB                    NOT NULL DEFAULT '{}',
    "last_error"      TEXT,
    "wait_until"      TIMESTAMP(3),
    "started_at"      TIMESTAMP(3)             NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at"    TIMESTAMP(3),
    "updated_at"      TIMESTAMP(3)             NOT NULL,
    CONSTRAINT "messaging_flow_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "messaging_flow_runs_subscriber_id_idx"     ON "messaging_flow_runs"("subscriber_id");
CREATE INDEX "messaging_flow_runs_flow_id_status_idx"    ON "messaging_flow_runs"("flow_id", "status");
CREATE INDEX "messaging_flow_runs_status_wait_until_idx" ON "messaging_flow_runs"("status", "wait_until");

ALTER TABLE "messaging_flow_runs"
    ADD CONSTRAINT "messaging_flow_runs_flow_id_fkey"
        FOREIGN KEY ("flow_id") REFERENCES "messaging_flows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "messaging_flow_runs"
    ADD CONSTRAINT "messaging_flow_runs_subscriber_id_fkey"
        FOREIGN KEY ("subscriber_id") REFERENCES "messaging_subscribers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
