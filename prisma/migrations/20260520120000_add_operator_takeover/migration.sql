-- AlterTable
ALTER TABLE "tg_subscribers" ADD COLUMN     "operator_assignee_id" TEXT,
ADD COLUMN     "operator_takeover_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "tg_subscribers_bot_id_operator_takeover_at_idx" ON "tg_subscribers"("bot_id", "operator_takeover_at");
