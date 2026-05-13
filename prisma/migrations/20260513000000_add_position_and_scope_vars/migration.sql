-- Iter 1: position model + 4-scope variables.
-- All additive. No data is destroyed; defaults handle pre-existing rows.

-- TgBot: project-level variables, constants, timezone.
ALTER TABLE "tg_bots"
  ADD COLUMN IF NOT EXISTS "project_variables" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "constants"         JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "timezone"          TEXT          DEFAULT 'Europe/Moscow';

-- TgSubscriber: track current position in funnel + fired-once flags +
-- typed custom fields bag (typed schema lives in TgCustomField in Iter 2).
ALTER TABLE "tg_subscribers"
  ADD COLUMN IF NOT EXISTS "current_position_flow_id" TEXT,
  ADD COLUMN IF NOT EXISTS "current_position_node_id" TEXT,
  ADD COLUMN IF NOT EXISTS "current_position_at"      TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "fired_once_triggers"      TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "custom_fields"            JSONB  NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS "tg_subscribers_botId_currentPositionFlowId_currentPositionNodeId_idx"
  ON "tg_subscribers" ("bot_id", "current_position_flow_id", "current_position_node_id");

-- TgFlowRun: track which positional node scheduled this run, so we can
-- auto-cancel sleeping/waiting runs when the subscriber moves on.
ALTER TABLE "tg_flow_runs"
  ADD COLUMN IF NOT EXISTS "position_group_id" TEXT;

CREATE INDEX IF NOT EXISTS "tg_flow_runs_subscriberId_positionGroupId_status_idx"
  ON "tg_flow_runs" ("subscriber_id", "position_group_id", "status");
