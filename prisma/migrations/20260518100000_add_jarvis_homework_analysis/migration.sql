-- Jarvis AI suggestion fields on homework_submissions.
-- Visible only to curators/admins; never sent to students.
-- aiSuggestedVerdict is one of "approve" | "reject" (free string for
-- forward-compat); aiSuggestedComment is the AI-drafted feedback.

ALTER TABLE "homework_submissions"
  ADD COLUMN IF NOT EXISTS "ai_suggested_verdict" TEXT,
  ADD COLUMN IF NOT EXISTS "ai_suggested_comment" TEXT,
  ADD COLUMN IF NOT EXISTS "ai_analyzed_at"       TIMESTAMP(3);
