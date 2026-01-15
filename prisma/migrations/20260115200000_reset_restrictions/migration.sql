-- Reset restricted modules and lessons to allow access to all students
UPDATE "enrollments" SET "restricted_modules" = '{}', "restricted_lessons" = '{}';
