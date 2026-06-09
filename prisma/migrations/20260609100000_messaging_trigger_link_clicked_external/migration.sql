-- Расширение MessagingTriggerType: link_clicked + external_event.
-- SaleBot-аналоги: "link_was_pressed <URL>" и "getcourse <event>".
ALTER TYPE "MessagingTriggerType" ADD VALUE IF NOT EXISTS 'link_clicked';
ALTER TYPE "MessagingTriggerType" ADD VALUE IF NOT EXISTS 'external_event';

-- Поля MessagingTrigger:
--   tracking_link_id — для link_clicked, NULL = «любая ссылка этого бота»
--   event_name        — для external_event, имя из webhook'а
ALTER TABLE "messaging_triggers"
    ADD COLUMN IF NOT EXISTS "tracking_link_id" TEXT,
    ADD COLUMN IF NOT EXISTS "event_name" TEXT;

-- Индексы для быстрых lookup'ов в матчере и webhook-приёмнике.
CREATE INDEX IF NOT EXISTS "messaging_triggers_type_event_name_idx"
    ON "messaging_triggers"("type", "event_name");
CREATE INDEX IF NOT EXISTS "messaging_triggers_type_tracking_link_id_idx"
    ON "messaging_triggers"("type", "tracking_link_id");
