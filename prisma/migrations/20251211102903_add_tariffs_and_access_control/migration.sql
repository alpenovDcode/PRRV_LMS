-- CreateEnum
CREATE TYPE "UserTariff" AS ENUM ('VR', 'LR', 'SR');

-- AlterTable
ALTER TABLE "modules" ADD COLUMN     "allowed_groups" TEXT[],
ADD COLUMN     "allowed_tariffs" "UserTariff"[],
ADD COLUMN     "allowed_tracks" TEXT[],
ADD COLUMN     "parent_id" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "tariff" "UserTariff";

-- CreateIndex
CREATE INDEX "modules_parent_id_idx" ON "modules"("parent_id");

-- AddForeignKey
ALTER TABLE "modules" ADD CONSTRAINT "modules_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
