-- Retry для шагов автоматизации.
--
-- Раньше при любой ошибке отправки (включая transient SMTP timeout) run
-- мгновенно помечался failed. Это убивало welcome-цепочку из-за единичного
-- кратковременного сбоя. Теперь применяется та же retry-policy что для
-- EmailDeliveryJob: 30s / 5m / 30m / 2h, потом failed.
--
-- attempt_count сбрасывается при продвижении на следующий шаг.

ALTER TABLE "email_automation_runs"
  ADD COLUMN "attempt_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "last_error" TEXT;
