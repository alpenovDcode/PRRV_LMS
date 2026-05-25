-- Add lms_user_id to tg_subscribers
ALTER TABLE "tg_subscribers" ADD COLUMN "lms_user_id" TEXT;

ALTER TABLE "tg_subscribers"
  ADD CONSTRAINT "tg_subscribers_lms_user_id_fkey"
  FOREIGN KEY ("lms_user_id")
  REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "tg_subscribers_lms_user_id_idx" ON "tg_subscribers"("lms_user_id");
