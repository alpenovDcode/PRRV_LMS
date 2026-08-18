ALTER TABLE "notifications" ADD COLUMN "event_key" TEXT;

CREATE UNIQUE INDEX "notifications_user_id_event_key_key"
ON "notifications"("user_id", "event_key");
