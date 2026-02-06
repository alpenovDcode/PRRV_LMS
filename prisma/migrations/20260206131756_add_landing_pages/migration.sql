-- AlterTable
-- ALTER TABLE "enrollments" ADD COLUMN     "forced_modules" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "homework_submissions" ADD COLUMN     "auto_response_scheduled_at" TIMESTAMP(3),
ADD COLUMN     "landing_block_id" TEXT,
ADD COLUMN     "response_template_index" INTEGER,
ALTER COLUMN "lesson_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "landing_pages" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "landing_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "landing_blocks" (
    "id" TEXT NOT NULL,
    "page_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "settings" JSONB,
    "response_templates" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "order_index" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "landing_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "landing_pages_slug_key" ON "landing_pages"("slug");

-- CreateIndex
CREATE INDEX "landing_blocks_page_id_idx" ON "landing_blocks"("page_id");

-- CreateIndex
CREATE INDEX "homework_submissions_landing_block_id_idx" ON "homework_submissions"("landing_block_id");

-- AddForeignKey
ALTER TABLE "homework_submissions" ADD CONSTRAINT "homework_submissions_landing_block_id_fkey" FOREIGN KEY ("landing_block_id") REFERENCES "landing_blocks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "landing_blocks" ADD CONSTRAINT "landing_blocks_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "landing_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
