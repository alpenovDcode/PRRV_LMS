-- AlterTable
ALTER TABLE "enrollments" ADD COLUMN     "forced_modules" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "landing_blocks" ADD COLUMN     "lesson_id" TEXT;

-- AlterTable
ALTER TABLE "lessons" ADD COLUMN     "ai_prompt" TEXT;

-- CreateIndex
CREATE INDEX "landing_blocks_lesson_id_idx" ON "landing_blocks"("lesson_id");

-- AddForeignKey
ALTER TABLE "landing_blocks" ADD CONSTRAINT "landing_blocks_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
