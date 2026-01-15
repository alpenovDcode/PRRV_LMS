-- AlterTable
ALTER TABLE "enrollments" ADD COLUMN "restricted_lessons" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "restricted_modules" TEXT[] DEFAULT ARRAY[]::TEXT[];
