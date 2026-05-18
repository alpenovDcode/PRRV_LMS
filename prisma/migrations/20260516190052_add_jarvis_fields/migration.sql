-- DropForeignKey
ALTER TABLE "question_messages" DROP CONSTRAINT "question_messages_author_id_fkey";

-- AlterTable
ALTER TABLE "question_messages" ADD COLUMN     "ai_sender_name" TEXT,
ADD COLUMN     "is_ai_reply" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "author_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "questions" ADD COLUMN     "jarvis_replied_at" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "question_messages" ADD CONSTRAINT "question_messages_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
