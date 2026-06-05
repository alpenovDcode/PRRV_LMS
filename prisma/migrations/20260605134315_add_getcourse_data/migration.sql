-- AlterTable
ALTER TABLE "brief_cases" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "briefs" ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateTable
CREATE TABLE "getcourse_data" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "getcourse_data_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "getcourse_data_user_id_key" ON "getcourse_data"("user_id");

-- AddForeignKey
ALTER TABLE "getcourse_data" ADD CONSTRAINT "getcourse_data_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
