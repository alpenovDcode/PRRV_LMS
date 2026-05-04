-- CreateEnum
CREATE TYPE "question_status" AS ENUM ('open', 'in_progress', 'answered', 'closed');

-- CreateTable
CREATE TABLE "broadcasts" (
    "id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "channels" TEXT[],
    "targets" JSONB NOT NULL,
    "recipients" INTEGER NOT NULL DEFAULT 0,
    "sent_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "broadcasts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "curator_id" TEXT,
    "subject" TEXT NOT NULL,
    "lesson_id" TEXT,
    "status" "question_status" NOT NULL DEFAULT 'open',
    "rating" INTEGER,
    "rating_comment" TEXT,
    "first_response_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_messages" (
    "id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "attachments" JSONB,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "broadcasts_author_id_idx" ON "broadcasts"("author_id");

-- CreateIndex
CREATE INDEX "broadcasts_sent_at_idx" ON "broadcasts"("sent_at");

-- CreateIndex
CREATE INDEX "questions_student_id_idx" ON "questions"("student_id");

-- CreateIndex
CREATE INDEX "questions_curator_id_idx" ON "questions"("curator_id");

-- CreateIndex
CREATE INDEX "questions_status_idx" ON "questions"("status");

-- CreateIndex
CREATE INDEX "questions_created_at_idx" ON "questions"("created_at");

-- CreateIndex
CREATE INDEX "question_messages_question_id_created_at_idx" ON "question_messages"("question_id", "created_at");

-- CreateIndex
CREATE INDEX "question_messages_author_id_idx" ON "question_messages"("author_id");

-- AddForeignKey
ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_curator_id_fkey" FOREIGN KEY ("curator_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_messages" ADD CONSTRAINT "question_messages_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_messages" ADD CONSTRAINT "question_messages_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
