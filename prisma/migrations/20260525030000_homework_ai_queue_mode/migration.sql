-- Добавляем mode: 'auto_approve' (legacy) | 'suggest' (для curator review)
ALTER TABLE "homework_ai_queue"
    ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'auto_approve';
