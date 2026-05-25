-- Защитная миграция: на части инсталляций таблица homework_ai_queue
-- была создана через prisma db push (без миграции), на других её нет.
-- Создаём таблицу если её нет, и добавляем колонку mode (тоже idempotent).

-- 1. Создаём таблицу с полным набором колонок (включая mode)
CREATE TABLE IF NOT EXISTS "homework_ai_queue" (
    "id"             TEXT NOT NULL,
    "submission_id"  TEXT NOT NULL,
    "lesson_title"   TEXT NOT NULL,
    "student_name"   TEXT NOT NULL,
    "student_answer" TEXT NOT NULL,
    "ai_prompt"      TEXT NOT NULL,
    "ai_context"     TEXT,
    "image_files"    JSONB NOT NULL,
    "lesson_content" JSONB,
    "check_after"    TIMESTAMP(3) NOT NULL,
    "status"         TEXT NOT NULL DEFAULT 'waiting',
    "mode"           TEXT NOT NULL DEFAULT 'auto_approve',
    "attempts"       INTEGER NOT NULL DEFAULT 0,
    "last_error"     TEXT,
    "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"     TIMESTAMP(3) NOT NULL,
    CONSTRAINT "homework_ai_queue_pkey" PRIMARY KEY ("id")
);

-- 2. Индексы
CREATE UNIQUE INDEX IF NOT EXISTS "homework_ai_queue_submission_id_key"
    ON "homework_ai_queue"("submission_id");

CREATE INDEX IF NOT EXISTS "homework_ai_queue_status_check_after_idx"
    ON "homework_ai_queue"("status", "check_after");

-- 3. Если таблица УЖЕ существовала (старая инсталляция без mode) —
--    добавим колонку отдельно. IF NOT EXISTS делает шаг идемпотентным.
ALTER TABLE "homework_ai_queue"
    ADD COLUMN IF NOT EXISTS "mode" TEXT NOT NULL DEFAULT 'auto_approve';
