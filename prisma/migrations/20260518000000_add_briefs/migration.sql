-- Brief feature: ученик заполняет многошаговую анкету для оформления
-- визуальной упаковки. Перенесено из Python-бота upakovka_pod_kluch.

CREATE TABLE IF NOT EXISTS "briefs" (
  "id"                  TEXT NOT NULL,
  "user_id"             TEXT NOT NULL,
  "status"              TEXT NOT NULL DEFAULT 'in_progress',
  "current_step"        INTEGER NOT NULL DEFAULT 1,

  "fio"                 TEXT,
  "subject"             TEXT,
  "target_audience"     TEXT,
  "pains_goals"         TEXT,

  "utp"                 TEXT,
  "education_text"      TEXT,
  "experience"          TEXT,
  "achievements"        TEXT,
  "methods"             TEXT,
  "formats"             TEXT,

  "ad_intro"            TEXT,
  "ad_process"          TEXT,
  "ad_result"           TEXT,

  "existing_style"      TEXT,
  "preferred_style"     TEXT,
  "character_image"     TEXT,
  "card_impression"     TEXT,
  "color_preferences"   TEXT,

  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at"        TIMESTAMP(3),

  CONSTRAINT "briefs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "briefs_user_id_key" ON "briefs"("user_id");
CREATE INDEX IF NOT EXISTS "briefs_status_completed_at_idx" ON "briefs"("status", "completed_at");

ALTER TABLE "briefs"
  ADD CONSTRAINT "briefs_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;


CREATE TABLE IF NOT EXISTS "brief_cases" (
  "id"           TEXT NOT NULL,
  "brief_id"     TEXT NOT NULL,
  "order_index"  INTEGER NOT NULL DEFAULT 0,

  "name"         TEXT,
  "age"          TEXT,
  "goal"         TEXT,
  "before_text"  TEXT,
  "duration"     TEXT,
  "problems"     TEXT,
  "after_text"   TEXT,
  "review_text"  TEXT,

  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "brief_cases_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "brief_cases_brief_id_order_index_idx" ON "brief_cases"("brief_id", "order_index");

ALTER TABLE "brief_cases"
  ADD CONSTRAINT "brief_cases_brief_id_fkey"
  FOREIGN KEY ("brief_id") REFERENCES "briefs"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;


CREATE TABLE IF NOT EXISTS "brief_files" (
  "id"          TEXT NOT NULL,
  "brief_id"    TEXT NOT NULL,
  "case_id"     TEXT,

  "file_type"   TEXT NOT NULL,
  "file_url"    TEXT NOT NULL,
  "file_name"   TEXT,
  "mime_type"   TEXT,
  "file_size"   INTEGER,

  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "brief_files_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "brief_files_brief_id_file_type_idx" ON "brief_files"("brief_id", "file_type");
CREATE INDEX IF NOT EXISTS "brief_files_case_id_idx" ON "brief_files"("case_id");

ALTER TABLE "brief_files"
  ADD CONSTRAINT "brief_files_brief_id_fkey"
  FOREIGN KEY ("brief_id") REFERENCES "briefs"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "brief_files"
  ADD CONSTRAINT "brief_files_case_id_fkey"
  FOREIGN KEY ("case_id") REFERENCES "brief_cases"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
