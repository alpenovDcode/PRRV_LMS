-- CreateEnum
CREATE TYPE "two_factor_method" AS ENUM ('totp', 'sms', 'email');

-- CreateEnum
CREATE TYPE "error_severity" AS ENUM ('critical', 'error', 'warning', 'info');

-- CreateEnum
CREATE TYPE "error_status" AS ENUM ('new', 'investigating', 'resolved', 'ignored');

-- AlterTable
ALTER TABLE "groups" ADD COLUMN     "course_id" TEXT,
ADD COLUMN     "start_date" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "lesson_progress" ADD COLUMN     "rating" INTEGER;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "about" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "track" TEXT;

-- CreateTable
CREATE TABLE "error_logs" (
    "id" TEXT NOT NULL,
    "group_id" TEXT,
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "url" TEXT,
    "user_agent" TEXT,
    "user_id" TEXT,
    "session_id" TEXT,
    "severity" "error_severity" NOT NULL DEFAULT 'error',
    "status" "error_status" NOT NULL DEFAULT 'new',
    "metadata" JSONB,
    "browser_info" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "error_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "error_groups" (
    "id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "status" "error_status" NOT NULL DEFAULT 'new',
    "severity" "error_severity" NOT NULL DEFAULT 'error',
    "first_occurred" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_occurred" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "resolved_by" TEXT,
    "notes" TEXT,

    CONSTRAINT "error_groups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "error_logs_group_id_idx" ON "error_logs"("group_id");

-- CreateIndex
CREATE INDEX "error_logs_user_id_idx" ON "error_logs"("user_id");

-- CreateIndex
CREATE INDEX "error_logs_severity_idx" ON "error_logs"("severity");

-- CreateIndex
CREATE INDEX "error_logs_status_idx" ON "error_logs"("status");

-- CreateIndex
CREATE INDEX "error_logs_created_at_idx" ON "error_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "error_groups_fingerprint_key" ON "error_groups"("fingerprint");

-- CreateIndex
CREATE INDEX "error_groups_fingerprint_idx" ON "error_groups"("fingerprint");

-- CreateIndex
CREATE INDEX "error_groups_status_idx" ON "error_groups"("status");

-- CreateIndex
CREATE INDEX "error_groups_last_occurred_idx" ON "error_groups"("last_occurred");

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "error_logs" ADD CONSTRAINT "error_logs_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "error_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "error_logs" ADD CONSTRAINT "error_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
