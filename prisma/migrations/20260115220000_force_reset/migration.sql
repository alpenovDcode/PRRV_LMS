-- Force reset restrictions (retry)
UPDATE "enrollments" SET "restricted_modules" = '{}', "restricted_lessons" = '{}';
