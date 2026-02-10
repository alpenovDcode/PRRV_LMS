-- AlterTable
ALTER TABLE "users" ADD COLUMN     "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[];
