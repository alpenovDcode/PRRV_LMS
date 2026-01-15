-- AlterTable
ALTER TABLE "homework_history" ADD COLUMN     "curator_audio_url" TEXT;

-- AlterTable
ALTER TABLE "homework_submissions" ADD COLUMN     "curator_audio_url" TEXT;

-- AlterTable
-- ALTER TABLE "users" ADD COLUMN     "frozen_until" TIMESTAMP(3),
-- ADD COLUMN     "is_blocked" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
-- CREATE TABLE "login_tokens" (
--     "id" TEXT NOT NULL,
--     "token" TEXT NOT NULL,
--     "user_id" TEXT NOT NULL,
--     "expires_at" TIMESTAMP(3) NOT NULL,
--     "used" BOOLEAN NOT NULL DEFAULT false,
--     "used_at" TIMESTAMP(3),
--     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
-- 
--     CONSTRAINT "login_tokens_pkey" PRIMARY KEY ("id")
-- );

-- CreateTable
-- CREATE TABLE "video_library" (
--     "id" TEXT NOT NULL,
--     "title" TEXT NOT NULL,
--     "cloudflare_id" TEXT NOT NULL,
--     "duration" INTEGER,
--     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
--     "updated_at" TIMESTAMP(3) NOT NULL,
-- 
--     CONSTRAINT "video_library_pkey" PRIMARY KEY ("id")
-- );

-- CreateIndex
-- CREATE UNIQUE INDEX "login_tokens_token_key" ON "login_tokens"("token");

-- CreateIndex
-- CREATE INDEX "login_tokens_token_idx" ON "login_tokens"("token");

-- CreateIndex
-- CREATE INDEX "login_tokens_user_id_idx" ON "login_tokens"("user_id");

-- CreateIndex
-- CREATE INDEX "login_tokens_expires_at_idx" ON "login_tokens"("expires_at");

-- CreateIndex
-- CREATE UNIQUE INDEX "video_library_cloudflare_id_key" ON "video_library"("cloudflare_id");

-- AddForeignKey
-- ALTER TABLE "login_tokens" ADD CONSTRAINT "login_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
