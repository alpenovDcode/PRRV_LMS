-- AlterEnum
ALTER TYPE "ProgressStatus" ADD VALUE 'failed';

-- AlterTable
ALTER TABLE "lessons" ADD COLUMN     "quiz_max_attempts" INTEGER DEFAULT 3,
ADD COLUMN     "quiz_passing_score" INTEGER,
ADD COLUMN     "quiz_requires_review" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "quiz_time_limit" INTEGER;

-- CreateTable
CREATE TABLE "homework_history" (
    "id" TEXT NOT NULL,
    "submission_id" TEXT NOT NULL,
    "content" TEXT,
    "files" JSONB,
    "status" "HomeworkStatus" NOT NULL,
    "curator_comment" TEXT,
    "curator_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "homework_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_attempts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "lesson_id" TEXT NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "answers" JSONB NOT NULL,
    "score" INTEGER,
    "is_passed" BOOLEAN NOT NULL DEFAULT false,
    "is_auto_graded" BOOLEAN NOT NULL DEFAULT false,
    "requires_review" BOOLEAN NOT NULL DEFAULT false,
    "curator_comment" TEXT,
    "curator_id" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_at" TIMESTAMP(3),
    "time_spent" INTEGER,

    CONSTRAINT "quiz_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_files" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "signed_url" TEXT,
    "signed_url_expires" TIMESTAMP(3),
    "uploaded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_media" (
    "id" TEXT NOT NULL,
    "lesson_id" TEXT NOT NULL,
    "media_id" TEXT NOT NULL,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lesson_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_comments" (
    "id" TEXT NOT NULL,
    "lesson_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "parent_id" TEXT,
    "content" TEXT NOT NULL,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lesson_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "channels" JSONB NOT NULL,
    "preferences" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "device_name" TEXT,
    "device_type" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_activity_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "two_factor_auth" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT false,
    "backup_codes" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "two_factor_auth_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "homework_history_submission_id_idx" ON "homework_history"("submission_id");

-- CreateIndex
CREATE INDEX "homework_history_created_at_idx" ON "homework_history"("created_at");

-- CreateIndex
CREATE INDEX "quiz_attempts_user_id_lesson_id_idx" ON "quiz_attempts"("user_id", "lesson_id");

-- CreateIndex
CREATE INDEX "quiz_attempts_lesson_id_idx" ON "quiz_attempts"("lesson_id");

-- CreateIndex
CREATE INDEX "quiz_attempts_is_passed_idx" ON "quiz_attempts"("is_passed");

-- CreateIndex
CREATE INDEX "media_files_uploaded_by_id_idx" ON "media_files"("uploaded_by_id");

-- CreateIndex
CREATE INDEX "media_files_mime_type_idx" ON "media_files"("mime_type");

-- CreateIndex
CREATE INDEX "lesson_media_lesson_id_idx" ON "lesson_media"("lesson_id");

-- CreateIndex
CREATE UNIQUE INDEX "lesson_media_lesson_id_media_id_key" ON "lesson_media"("lesson_id", "media_id");

-- CreateIndex
CREATE INDEX "lesson_comments_lesson_id_idx" ON "lesson_comments"("lesson_id");

-- CreateIndex
CREATE INDEX "lesson_comments_user_id_idx" ON "lesson_comments"("user_id");

-- CreateIndex
CREATE INDEX "lesson_comments_parent_id_idx" ON "lesson_comments"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_user_id_key" ON "notification_preferences"("user_id");

-- CreateIndex
CREATE INDEX "user_sessions_user_id_idx" ON "user_sessions"("user_id");

-- CreateIndex
CREATE INDEX "user_sessions_is_active_idx" ON "user_sessions"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "user_sessions_user_id_session_id_key" ON "user_sessions"("user_id", "session_id");

-- CreateIndex
CREATE UNIQUE INDEX "two_factor_auth_user_id_key" ON "two_factor_auth"("user_id");

-- AddForeignKey
ALTER TABLE "homework_history" ADD CONSTRAINT "homework_history_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "homework_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_history" ADD CONSTRAINT "homework_history_curator_id_fkey" FOREIGN KEY ("curator_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_curator_id_fkey" FOREIGN KEY ("curator_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_files" ADD CONSTRAINT "media_files_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_media" ADD CONSTRAINT "lesson_media_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_media" ADD CONSTRAINT "lesson_media_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_comments" ADD CONSTRAINT "lesson_comments_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_comments" ADD CONSTRAINT "lesson_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_comments" ADD CONSTRAINT "lesson_comments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "lesson_comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "two_factor_auth" ADD CONSTRAINT "two_factor_auth_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
