-- Iter 4: admin audit log.

CREATE TABLE IF NOT EXISTS "tg_audit_log" (
  "id"               TEXT NOT NULL,
  "actor_user_id"    TEXT,
  "actor_email"      TEXT,
  "bot_id"           TEXT,
  "action"           TEXT NOT NULL,
  "details"          JSONB NOT NULL DEFAULT '{}',
  "outcome"          TEXT NOT NULL DEFAULT 'ok',
  "ip"               TEXT,
  "user_agent"       TEXT,
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "tg_audit_log_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "tg_audit_log_botId_createdAt_idx" ON "tg_audit_log" ("bot_id", "created_at");
CREATE INDEX IF NOT EXISTS "tg_audit_log_actorUserId_createdAt_idx" ON "tg_audit_log" ("actor_user_id", "created_at");
CREATE INDEX IF NOT EXISTS "tg_audit_log_action_createdAt_idx" ON "tg_audit_log" ("action", "created_at");
