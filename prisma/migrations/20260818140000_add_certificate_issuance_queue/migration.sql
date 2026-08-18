CREATE TABLE "certificate_issuance_jobs" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "course_id" TEXT NOT NULL,
  "certification_lesson_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "locked_at" TIMESTAMP(3),
  "last_error" TEXT,
  "certificate_id" TEXT,
  "email_sent_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "certificate_issuance_jobs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "certificate_issuance_jobs_user_id_course_id_key"
ON "certificate_issuance_jobs"("user_id", "course_id");

CREATE INDEX "certificate_issuance_jobs_status_next_attempt_at_idx"
ON "certificate_issuance_jobs"("status", "next_attempt_at");
