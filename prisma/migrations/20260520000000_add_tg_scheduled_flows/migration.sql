-- CreateTable
CREATE TABLE "tg_scheduled_flows" (
    "id" TEXT NOT NULL,
    "bot_id" TEXT NOT NULL,
    "flow_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filter" JSONB NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "total_launched" INTEGER NOT NULL DEFAULT 0,
    "total_failed" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tg_scheduled_flows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tg_scheduled_flows_bot_id_status_idx" ON "tg_scheduled_flows"("bot_id", "status");

-- CreateIndex
CREATE INDEX "tg_scheduled_flows_status_scheduled_at_idx" ON "tg_scheduled_flows"("status", "scheduled_at");

-- AddForeignKey
ALTER TABLE "tg_scheduled_flows" ADD CONSTRAINT "tg_scheduled_flows_bot_id_fkey" FOREIGN KEY ("bot_id") REFERENCES "tg_bots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
